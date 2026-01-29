import { Client } from '@elastic/elasticsearch';
import { createConnection } from 'mysql2/promise';

// Load env variables manually to avoid extra dependencies
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const envConfig = readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value && !process.env[key.trim()]) {
      process.env[key.trim()] = value.trim();
    }
  });
}

interface Concept {
  id: string;
  label: string;
  definition: string;
  level: number;
}

interface DBConcept extends Concept {
  created_at: Date;
  updated_at: Date;
}

interface Variant {
  concept_id: string;
  name: string;
}

async function main() {
  console.log('🚀 Starting Re-Indexing Process...');

  // 1. Setup DB Connection
  const connection = await createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || 'rootpass123',
    database: process.env.DATABASE_NAME || 'dag_db',
  });

  try {
    // 2. Setup Elasticsearch Client
    const esClient = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });
    const indexName = process.env.ES_INDEX_NAME || 'concepts';

    // 3. Re-create Index with NEW Mapping
    console.log(`🗑️  Deleting existing index: ${indexName}...`);
    const esExists = await esClient.indices.exists({ index: indexName });
    if (esExists) {
      await esClient.indices.delete({ index: indexName });
    }

    console.log(`🆕 Creating new index: ${indexName} with updated mapping...`);
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
          definition: {
            type: 'text',
            analyzer: 'custom_analyzer',
            fields: {
              keyword: { type: 'keyword', ignore_above: 256 },
            },
          },
          level: { type: 'integer' },
          variants: {
            type: 'text',
            analyzer: 'custom_analyzer',
            fields: {
              keyword: { type: 'keyword' },
            },
          },
        },
      },
    });

    // 4. Fetch Data from MySQL
    console.log('📥 Fetching concepts from database...');
    const [concepts] = await connection.execute(
      'SELECT id, label, definition, level FROM concepts',
    );
    const conceptRows = concepts as DBConcept[];
    console.log(`   Found ${conceptRows.length} concepts.`);

    console.log('📥 Fetching variants from database...');
    const [variants] = await connection.execute(
      'SELECT concept_id, name FROM variants',
    );
    const variantRows = variants as Variant[];
    console.log(`   Found ${variantRows.length} variants.`);

    // Group variants by concept_id
    const variantsMap = new Map<string, string[]>();
    variantRows.forEach((v) => {
      if (!variantsMap.has(v.concept_id)) {
        variantsMap.set(v.concept_id, []);
      }
      variantsMap.get(v.concept_id)?.push(v.name);
    });

    // 5. Indexing Loop
    console.log('📝 Indexing to Elasticsearch...');
    let indexedNodes = 0;
    const batchSize = 1000;

    for (let i = 0; i < conceptRows.length; i += batchSize) {
      const batch = conceptRows.slice(i, i + batchSize);
      const operations = batch.flatMap((concept) => [
        { index: { _index: indexName, _id: concept.id } },
        {
          id: concept.id,
          label: concept.label,
          definition: concept.definition,
          level: concept.level,
          variants: variantsMap.get(concept.id) || [],
        },
      ]);

      const result = await esClient.bulk({ operations, refresh: false });
      if (result.errors) {
        console.error('   ⚠️ Error in bulk indexing', result.items);
      }
      indexedNodes += batch.length;
      process.stdout.write(
        `\r   Indexed ${indexedNodes}/${conceptRows.length} docs...`,
      );
    }

    await esClient.indices.refresh({ index: indexName });
    console.log('\n✅ Re-index completed successfully!');
  } catch (error) {
    console.error('\n❌ Re-index failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
