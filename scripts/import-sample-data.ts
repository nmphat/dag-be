import { Client } from '@elastic/elasticsearch';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { createConnection } from 'mysql2/promise';
import { join } from 'path';

// Load env variables
require('dotenv').config();

interface Concept {
  id: string;
  label: string;
  definition: string;
  level: number;
  variants: string[];
}

interface Edge {
  parentId: string;
  childId: string;
}

const TRACKER_FILE = join(
  __dirname,
  '../docs/sample-data/from-wikidata/imported.txt',
);
const BASE_DATA_DIR = join(__dirname, '../docs/sample-data/from-wikidata');

async function main() {
  const args = process.argv.slice(2);
  const targetFolder = args[0]; // Optional specific folder

  const connection = await createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || 'rootpass123',
    database: process.env.DATABASE_NAME || 'dag_db',
    multipleStatements: true,
  });

  const esClient = new Client({
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  });
  const indexName = process.env.ES_INDEX_NAME || 'concepts';

  try {
    const importedFolders = existsSync(TRACKER_FILE)
      ? readFileSync(TRACKER_FILE, 'utf-8').split('\n').filter(Boolean)
      : [];

    let foldersToProcess: string[] = [];

    if (targetFolder) {
      foldersToProcess = [targetFolder];
    } else {
      foldersToProcess = readdirSync(BASE_DATA_DIR).filter((f) => {
        const fullPath = join(BASE_DATA_DIR, f);
        return (
          lstatSync(fullPath).isDirectory() && !importedFolders.includes(f)
        );
      });
    }

    if (foldersToProcess.length === 0) {
      console.log('✨ No new folders to import.');
      return;
    }

    console.log(`📂 Found ${foldersToProcess.length} folders to process.`);

    for (const folder of foldersToProcess) {
      const folderPath = join(BASE_DATA_DIR, folder);
      const conceptsPath = join(folderPath, 'concepts.json');
      const edgesPath = join(folderPath, 'edges.json');

      if (!existsSync(conceptsPath) || !existsSync(edgesPath)) {
        console.warn(
          `⚠️ Skipping ${folder}: concepts.json or edges.json missing.`,
        );
        continue;
      }

      console.log(`\n📥 Importing from: ${folder}...`);

      const concepts: Concept[] = JSON.parse(
        readFileSync(conceptsPath, 'utf-8'),
      );
      const edges: Edge[] = JSON.parse(readFileSync(edgesPath, 'utf-8'));

      console.log(
        `   Found ${concepts.length} concepts, ${edges.length} edges.`,
      );

      // --- 1. Database Import ---
      const now = new Date();
      const batchSize = 500;

      for (let i = 0; i < concepts.length; i += batchSize) {
        const batch = concepts.slice(i, i + batchSize);

        // Concepts
        const conceptValues = batch
          .map((c) => [c.id, c.label, c.definition || null, c.level, now, now])
          .flat();
        const conceptPlaceholders = batch
          .map(() => '(?, ?, ?, ?, ?, ?)')
          .join(',');
        await connection.execute(
          `INSERT IGNORE INTO concepts (id, label, definition, level, created_at, updated_at) VALUES ${conceptPlaceholders}`,
          conceptValues,
        );

        // Variants
        const variantValues: any[] = [];
        for (const c of batch) {
          if (c.variants?.length > 0) {
            for (const vName of c.variants) {
              variantValues.push(c.id, vName, now);
            }
          }
        }

        if (variantValues.length > 0) {
          const vBatchSize = 1000;
          for (let j = 0; j < variantValues.length; j += vBatchSize * 3) {
            const chunk = variantValues.slice(j, j + vBatchSize * 3);
            const placeholders = Array(chunk.length / 3)
              .fill('(?, ?, ?)')
              .join(',');
            await connection.execute(
              `INSERT IGNORE INTO variants (concept_id, name, created_at) VALUES ${placeholders}`,
              chunk,
            );
          }
        }
      }

      // Edges
      const edgeBatchSize = 1000;
      for (let i = 0; i < edges.length; i += edgeBatchSize) {
        const batch = edges.slice(i, i + edgeBatchSize);
        const values = batch.map((e) => [e.parentId, e.childId, now]).flat();
        const placeholders = batch.map(() => '(?, ?, ?)').join(',');
        await connection.execute(
          `INSERT IGNORE INTO edges (parent_id, child_id, created_at) VALUES ${placeholders}`,
          values,
        );
      }

      // --- 2. Elasticsearch Indexing ---
      console.log(`   Indexing ${concepts.length} concepts to ES...`);
      for (let i = 0; i < concepts.length; i += batchSize) {
        const batch = concepts.slice(i, i + batchSize);
        const operations = batch.flatMap((c) => [
          { index: { _index: indexName, _id: c.id } },
          {
            id: c.id,
            label: c.label,
            definition: c.definition,
            level: c.level,
            variants: c.variants || [],
          },
        ]);
        await esClient.bulk({ operations, refresh: false });
      }

      console.log(`✅ Finished ${folder}.`);

      // Update tracker
      if (!targetFolder) {
        writeFileSync(TRACKER_FILE, folder + '\n', { flag: 'a' });
      }
    }

    await esClient.indices.refresh({ index: indexName });
    console.log('\n🌟 All scheduled imports completed!');
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
