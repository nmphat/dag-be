import { Client } from '@elastic/elasticsearch';
import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import { join } from 'path';

// Load env variables if not already loaded
// require('dotenv').config();

interface Concept {
  id: string;
  label: string;
  definition: string;
  level: number;
  variants: string[];
}

interface ConceptsData {
  concepts: Concept[];
}

interface EdgesData {
  edges: Array<[string, string]>;
}

async function main() {
  // 1. Setup DB Connection
  const connection = await createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || 'rootpass123',
    database: process.env.DATABASE_NAME || 'dag_db',
    // Allow executing multiple statements/large packets
    multipleStatements: true,
  });

  try {
    console.log('📥 Loading sample data...');
    const conceptsPath = join(__dirname, '../docs/sample-data/concepts.json');
    const edgesPath = join(__dirname, '../docs/sample-data/edges.json');

    const conceptsData: ConceptsData = JSON.parse(
      readFileSync(conceptsPath, 'utf-8'),
    );
    const edgesData: EdgesData = JSON.parse(readFileSync(edgesPath, 'utf-8'));

    console.log(`Found ${conceptsData.concepts.length} concepts`);
    console.log(`Found ${edgesData.edges.length} edges`);

    console.log('🗑️  Clearing existing data...');
    // Disable FK checks temporarily to truncate tables quickly
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE edges');
    await connection.query('TRUNCATE TABLE variants');
    await connection.query('TRUNCATE TABLE concepts');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('📝 Importing concepts & variants...');
    let importedNodes = 0;

    // REDUCED BATCH SIZE to avoid "Too many placeholders" error
    // 500 concepts * 6 params = 3000 params (Safe)
    const batchSize = 500;

    for (let i = 0; i < conceptsData.concepts.length; i += batchSize) {
      const batch = conceptsData.concepts.slice(i, i + batchSize);
      const now = new Date();

      // --- 1. Insert Concepts ---
      const conceptValues = batch.map((c) => [
        c.id,
        c.label,
        c.definition || null,
        c.level,
        now,
        now,
      ]);

      const conceptPlaceholders = batch
        .map(() => '(?, ?, ?, ?, ?, ?)')
        .join(',');

      await connection.execute(
        `INSERT INTO concepts (id, label, definition, level, created_at, updated_at) VALUES ${conceptPlaceholders}`,
        conceptValues.flat(),
      );

      // --- 2. Insert Variants (Chunked Safety) ---
      const variantValues: any[] = [];
      for (const c of batch) {
        if (c.variants?.length > 0) {
          for (const vName of c.variants) {
            variantValues.push(c.id, vName, now);
          }
        }
      }

      if (variantValues.length > 0) {
        // Splitting variants if too many (Edge case protection)
        const VARIANT_BATCH_LIMIT = 2000; // max items per insert

        // Loop through chunks of the flattened array
        // Each record has 3 fields, so step is VARIANT_BATCH_LIMIT * 3
        for (
          let j = 0;
          j < variantValues.length;
          j += VARIANT_BATCH_LIMIT * 3
        ) {
          const chunk = variantValues.slice(j, j + VARIANT_BATCH_LIMIT * 3);
          const chunkCount = chunk.length / 3;
          const placeholders = Array(chunkCount).fill('(?, ?, ?)').join(',');

          await connection.execute(
            `INSERT INTO variants (concept_id, name, created_at) VALUES ${placeholders}`,
            chunk,
          );
        }
      }

      importedNodes += batch.length;
      process.stdout.write(
        `\r   Imported ${importedNodes}/${conceptsData.concepts.length} concepts...`,
      );
    }
    console.log('\n✅ Concepts Imported.');

    console.log('🔗 Importing edges...');
    let importedEdges = 0;

    // Batch size for edges can be higher (only 3 params per row)
    const edgeBatchSize = 2000;

    for (let i = 0; i < edgesData.edges.length; i += edgeBatchSize) {
      const batch = edgesData.edges.slice(i, i + edgeBatchSize);
      const now = new Date();

      const values = batch.map((edge) => [...edge, now]).flat();
      const placeholders = batch.map(() => '(?, ?, ?)').join(',');

      // Use INSERT IGNORE to skip duplicates or invalid FKs gracefully
      await connection.execute(
        `INSERT IGNORE INTO edges (parent_id, child_id, created_at) VALUES ${placeholders}`,
        values,
      );

      importedEdges += batch.length;
      process.stdout.write(
        `\r   Imported ${importedEdges}/${edgesData.edges.length} edges...`,
      );
    }
    console.log('\n✅ Edges Imported.');

    // --- Elasticsearch Indexing ---
    console.log('🔍 Indexing to Elasticsearch...');
    const esClient = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });

    const indexName = process.env.ES_INDEX_NAME || 'concepts';

    // Ensure fresh index
    const esExists = await esClient.indices.exists({ index: indexName });
    if (esExists) {
      await esClient.indices.delete({ index: indexName });
    }

    await esClient.indices.create({
      index: indexName,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            custom_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding'],
            },
          },
        },
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          label: {
            type: 'text',
            analyzer: 'custom_analyzer',
            fields: { keyword: { type: 'keyword' } },
          },
          definition: { type: 'text', analyzer: 'custom_analyzer' },
          level: { type: 'integer' },
          variants: { type: 'text', analyzer: 'custom_analyzer' },
        },
      },
    });

    let indexedNodes = 0;
    // Reuse concept batch size
    for (let i = 0; i < conceptsData.concepts.length; i += batchSize) {
      const batch = conceptsData.concepts.slice(i, i + batchSize);
      const operations = batch.flatMap((concept) => [
        { index: { _index: indexName, _id: concept.id } },
        {
          id: concept.id,
          label: concept.label,
          definition: concept.definition,
          level: concept.level,
          variants: concept.variants || [],
        },
      ]);

      await esClient.bulk({ operations, refresh: false });
      indexedNodes += batch.length;
      process.stdout.write(
        `\r   Indexed ${indexedNodes}/${conceptsData.concepts.length} docs...`,
      );
    }

    await esClient.indices.refresh({ index: indexName });
    console.log('\n✅ Import completed successfully!');
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
