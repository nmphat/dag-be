/**
 * Benchmark Script for Taxonomy Explorer
 * Measures p50, p95 latency for search and navigation operations
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Load env variables
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

const PORT = process.env.PORT || '13000';
const API_BASE = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const WARMUP_ITERATIONS = 5;
const BENCHMARK_ITERATIONS = 50;
// Default to 'all', can be set to 'engineering', 'medical', 'chemical', 'sample'
const TEST_MODE = process.env.TEST_MODE || 'all';

interface BenchmarkResult {
  name: string;
  p50: number;
  p95: number;
  avg: number;
  min: number;
  max: number;
  iterations: number;
}

interface Scenario {
  name: string;
  endpoint: string;
  method?: 'GET' | 'POST';
  iterations?: number;
  tags: string[]; // Added tags for filtering
}

const ALL_SCENARIOS: Scenario[] = [
  // ===== ENGINEERING SCENARIOS (Sample Data) =====
  {
    name: 'search_eng_basic',
    endpoint: '/concepts/search/fulltext?q=software+engineering&pageSize=20',
    tags: ['engineering', 'sample'],
  },
  {
    name: 'search_eng_acronym',
    endpoint: '/concepts/search/fulltext?q=api+rest+graphql&pageSize=20',
    tags: ['engineering', 'sample'],
  },
  {
    name: 'search_eng_framework',
    endpoint: '/concepts/search/fulltext?q=react+native+flutter&pageSize=20',
    tags: ['engineering', 'sample'],
  },
  {
    name: 'search_eng_infrastructure',
    endpoint:
      '/concepts/search/fulltext?q=kubernetes+docker+container&pageSize=20',
    tags: ['engineering', 'sample'],
  },
  {
    name: 'search_eng_algorithm',
    endpoint: '/concepts/search/fulltext?q=binary+search+tree&pageSize=20',
    tags: ['engineering', 'sample'],
  },

  // ===== MEDICAL SCENARIOS =====
  {
    name: 'search_simple_disease',
    endpoint: '/concepts/search/fulltext?q=cancer&pageSize=20',
    tags: ['medical'],
  },
  {
    name: 'search_simple_syndrome',
    endpoint: '/concepts/search/fulltext?q=syndrome&pageSize=20',
    tags: ['medical'],
  },
  {
    name: 'search_med_copd',
    endpoint:
      '/concepts/search/fulltext?q=chronic+obstructive+pulmonary+disease&pageSize=20',
    tags: ['medical'],
  },
  {
    name: 'search_med_adhd',
    endpoint:
      '/concepts/search/fulltext?q=attention+deficit+hyperactivity+disorder&pageSize=20',
    tags: ['medical'],
  },

  // ===== CHEMICAL SCENARIOS =====
  {
    name: 'search_simple_chem',
    endpoint: '/concepts/search/fulltext?q=acid&pageSize=20',
    tags: ['chemical'],
  },
  {
    name: 'search_chem_heptachlor',
    endpoint:
      '/concepts/search/fulltext?q=1_1_2_3_4_5_6_heptachlorocyclohexane&pageSize=20',
    tags: ['chemical'],
  },
  {
    name: 'search_chem_complex',
    endpoint:
      '/concepts/search/fulltext?q=10_hydroxy_2_2_6_trimethyl_7_8_dioxatricyclo&pageSize=20',
    tags: ['chemical'],
  },

  // ===== GENERAL/FUZZY SCENARIOS =====
  {
    name: 'search_cat_device',
    endpoint: '/concepts/search/fulltext?q=electronic+device&pageSize=20',
    tags: ['general'],
  },
  {
    name: 'search_fuzzy_engineering',
    endpoint: '/concepts/search/fulltext?q=enginering&pageSize=20',
    tags: ['engineering', 'sample', 'fuzzy'],
  },
  {
    name: 'search_fuzzy_cancer',
    endpoint: '/concepts/search/fulltext?q=canccer&pageSize=20',
    tags: ['medical', 'fuzzy'],
  },

  // ===== NAVIGATION SCENARIOS (Generic) =====
  {
    name: 'get_concept',
    endpoint: '/concepts/{conceptId}',
    tags: ['nav', 'all', 'engineering', 'medical', 'chemical', 'sample'],
  },
  {
    name: 'get_children',
    endpoint: '/concepts/{parentWithManyChildren}/children?pageSize=20',
    tags: ['nav', 'all', 'engineering', 'medical', 'chemical', 'sample'],
  },
  {
    name: 'get_children_large',
    endpoint: '/concepts/{parentWithManyChildren}/children?pageSize=50',
    tags: ['nav', 'all', 'engineering', 'medical', 'chemical', 'sample'],
  },
  {
    name: 'get_parents',
    endpoint: '/concepts/{childId}/parents?pageSize=20',
    tags: ['nav', 'all', 'engineering', 'medical', 'chemical', 'sample'],
  },
  {
    name: 'paths_to_root',
    endpoint: '/concepts/{conceptId}/paths',
    tags: ['nav', 'all', 'engineering', 'medical', 'chemical', 'sample'],
  },
];

function calculatePercentile(sortedArr: number[], percentile: number): number {
  const index = Math.floor(sortedArr.length * (percentile / 100));
  return sortedArr[Math.min(index, sortedArr.length - 1)];
}

async function measureLatency(
  url: string,
  iterations: number,
): Promise<{ latencies: number[]; errors: number }> {
  const latencies: number[] = [];
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const response = await fetch(url);
      if (!response.ok) {
        errors++;
        continue;
      }
      await response.json(); // Consume response body
    } catch (e) {
      errors++;
      continue;
    }
    const end = performance.now();
    latencies.push(end - start);
  }

  return { latencies, errors };
}

async function fetchSampleConcepts(): Promise<{
  conceptId: string;
  parentWithManyChildren: string;
  childId: string;
}> {
  // Queries used to find "seed" data for navigation tests.
  // We include keywords from all domains to ensure we find *something* in the DB.
  const queries = [
    '', // Empty search usually returns top concepts
    'engineering',
    'software',
    'system', // Engineering
    'acid',
    'chemical', // Chemical
    'disease',
    'syndrome', // Medical
    'object',
    'device', // General
  ];

  let searchData: any = null;

  for (const q of queries) {
    try {
      const endpoint = q
        ? `${API_BASE}/concepts/search/fulltext?q=${q}&pageSize=50`
        : `${API_BASE}/concepts/search/fulltext?pageSize=50`;
      const searchRes = await fetch(endpoint);
      const data = await searchRes.json();

      if (data.concepts && data.concepts.length > 0) {
        searchData = data;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!searchData || !searchData.concepts || searchData.concepts.length === 0) {
    throw new Error('No concepts found in database. Please import data first.');
  }

  // Strategy to find good test candidates
  const concepts = searchData.concepts;

  // 1. A concept ID for basic fetch
  const conceptId = concepts[0].id;

  // 2. A parent likely to have children (Level 0 or 1, or just the first one)
  const rootConcept = concepts.find((c: any) => c.level <= 1) || concepts[0];
  const parentWithManyChildren = rootConcept.id;

  // 3. A child concept (Level >= 2 if possible, for path computation)
  const childConcept =
    concepts.find((c: any) => c.level >= 2) || concepts[1] || concepts[0];
  const childId = childConcept.id;

  return { conceptId, parentWithManyChildren, childId };
}

async function runBenchmark(): Promise<BenchmarkResult[]> {
  console.log('🚀 Starting Benchmark Suite\n');
  console.log('='.repeat(70));
  console.log(`🔧 TEST_MODE: ${TEST_MODE.toUpperCase()}`);

  // Filter scenarios based on TEST_MODE
  const activeScenarios = ALL_SCENARIOS.filter((s) => {
    if (TEST_MODE === 'all') return true;
    return s.tags.includes(TEST_MODE) || s.tags.includes('all'); // Always include generic nav tests tagged 'all' if you want, but here we explicitly tagged navs with categories too.
    // Note: The nav scenarios have all tags, so they will be included in specific modes.
  });

  console.log(`📋 Loaded ${activeScenarios.length} scenarios for execution.\n`);

  // Check API is available
  try {
    const healthCheck = await fetch(`${API_BASE.replace('/api', '')}/health`);
    if (!healthCheck.ok) {
      throw new Error('API not responding');
    }
    console.log('✅ API is available\n');
  } catch (e) {
    console.error('❌ Cannot connect to API. Is the server running?');
    console.error(`   Tried: ${API_BASE}`);
    process.exit(1);
  }

  // Get sample concept IDs for navigation tests
  console.log('📥 Fetching sample concepts for navigation benchmarks...');
  const sampleConcepts = await fetchSampleConcepts();
  console.log(`   Using conceptId: ${sampleConcepts.conceptId}`);
  console.log(`   Using parent:    ${sampleConcepts.parentWithManyChildren}`);
  console.log(`   Using childId:   ${sampleConcepts.childId}\n`);

  // Get stats
  try {
    const statsRes = await fetch(`${API_BASE}/concepts/admin/stats`);
    const stats = await statsRes.json();
    console.log('📊 Dataset Stats:');
    console.log(
      `   Total Nodes: ${stats.totalNodes?.toLocaleString() || 'N/A'}`,
    );
    console.log(
      `   Total Edges: ${stats.totalEdges?.toLocaleString() || 'N/A'}`,
    );
    console.log(`   Max Depth:   ${stats.maxDepth || 'N/A'}\n`);
  } catch (e) {
    console.log('⚠️  Could not fetch stats\n');
  }

  const results: BenchmarkResult[] = [];

  for (const scenario of activeScenarios) {
    // Replace placeholders with actual IDs
    let endpoint = scenario.endpoint
      .replace('{conceptId}', sampleConcepts.conceptId)
      .replace(
        '{parentWithManyChildren}',
        sampleConcepts.parentWithManyChildren,
      )
      .replace('{childId}', sampleConcepts.childId);

    const url = `${API_BASE}${endpoint}`;
    const iterations = scenario.iterations || BENCHMARK_ITERATIONS;

    process.stdout.write(`⏱️  ${scenario.name.padEnd(30)} `);

    // Warmup
    await measureLatency(url, WARMUP_ITERATIONS);

    // Actual benchmark
    const { latencies, errors } = await measureLatency(url, iterations);

    if (latencies.length === 0) {
      console.log(`❌ All requests failed`);
      continue;
    }

    // Sort for percentile calculations
    latencies.sort((a, b) => a - b);

    const result: BenchmarkResult = {
      name: scenario.name,
      p50: calculatePercentile(latencies, 50),
      p95: calculatePercentile(latencies, 95),
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      min: latencies[0],
      max: latencies[latencies.length - 1],
      iterations: latencies.length,
    };

    results.push(result);

    console.log(
      `p50: ${result.p50.toFixed(1).padStart(6)}ms | ` +
        `p95: ${result.p95.toFixed(1).padStart(6)}ms | ` +
        `avg: ${result.avg.toFixed(1).padStart(6)}ms` +
        (errors > 0 ? ` | ⚠️ ${errors} errors` : ''),
    );
  }

  return results;
}

function printSummaryTable(results: BenchmarkResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log(`📊 BENCHMARK SUMMARY (Mode: ${TEST_MODE})`);
  console.log('='.repeat(80));

  console.log(
    '\n┌────────────────────────────────┬─────────┬─────────┬─────────┬─────────┐',
  );
  console.log(
    '│ Scenario                       │ p50     │ p95     │ avg     │ max     │',
  );
  console.log(
    '├────────────────────────────────┼─────────┼─────────┼─────────┼─────────┤',
  );

  for (const r of results) {
    console.log(
      `│ ${r.name.padEnd(30)} │ ` +
        `${r.p50.toFixed(0).padStart(5)}ms │ ` +
        `${r.p95.toFixed(0).padStart(5)}ms │ ` +
        `${r.avg.toFixed(0).padStart(5)}ms │ ` +
        `${r.max.toFixed(0).padStart(5)}ms │`,
    );
  }

  console.log(
    '└────────────────────────────────┴─────────┴─────────┴─────────┴─────────┘',
  );

  if (results.length > 0) {
    const avgP50 = results.reduce((a, r) => a + r.p50, 0) / results.length;
    const avgP95 = results.reduce((a, r) => a + r.p95, 0) / results.length;
    console.log(
      `\n📈 Overall: avg p50 = ${avgP50.toFixed(1)}ms, avg p95 = ${avgP95.toFixed(1)}ms`,
    );
    console.log(
      `   Iterations per scenario: ${BENCHMARK_ITERATIONS} (+ ${WARMUP_ITERATIONS} warmup)`,
    );
  } else {
    console.log('\n⚠️  No scenarios run.');
  }
}

async function main() {
  console.log('');
  console.log(
    '╔═══════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║           TAXONOMY EXPLORER - PERFORMANCE BENCHMARK               ║',
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════════╝',
  );
  console.log('');

  const startTime = performance.now();

  try {
    const results = await runBenchmark();
    printSummaryTable(results);
    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\n⏱️  Total benchmark time: ${totalTime}s`);
    console.log('✅ Benchmark completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();
