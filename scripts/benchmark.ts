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
const BENCHMARK_ITERATIONS = 20;

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
}

const SCENARIOS: Scenario[] = [
  // ===== SEARCH SCENARIOS - Simple & Common =====
  {
    name: 'search_simple_disease',
    endpoint: '/concepts/search/fulltext?q=cancer&pageSize=20',
  },
  {
    name: 'search_simple_chem',
    endpoint: '/concepts/search/fulltext?q=acid&pageSize=20',
  },
  {
    name: 'search_user_engineering',
    endpoint: '/concepts/search/fulltext?q=engineering&pageSize=20',
  },

  // ===== SEARCH SCENARIOS - Complex Medical Terms (Long) =====
  {
    name: 'search_complex_med_1',
    endpoint:
      '/concepts/search/fulltext?q=hereditary+breast+ovarian+cancer&pageSize=20',
  },
  {
    name: 'search_complex_med_2',
    endpoint:
      '/concepts/search/fulltext?q=autosomal+dominant+polycystic+kidney+disease&pageSize=20',
  },
  {
    name: 'search_complex_med_3',
    endpoint:
      '/concepts/search/fulltext?q=parasitic+helminthiasis+infectious+disease&pageSize=20',
  },
  {
    name: 'search_complex_med_4',
    endpoint:
      '/concepts/search/fulltext?q=chronic+progressive+external+ophthalmoplegia&pageSize=20',
  },

  // ===== SEARCH SCENARIOS - Chemical Compounds (Formulas/Underscores) =====
  {
    name: 'search_chem_formula_1',
    endpoint:
      '/concepts/search/fulltext?q=methyl_7_14_16_tribromo_8_hydroxyhexadeca&pageSize=20',
  },
  {
    name: 'search_chem_formula_2',
    endpoint:
      '/concepts/search/fulltext?q=alpha_d_galp__1__4__beta_d_galp&pageSize=20',
  },
  {
    name: 'search_chem_complex',
    endpoint:
      '/concepts/search/fulltext?q=10_hydroxy_2_2_6_trimethyl_7_8_dioxatricyclo&pageSize=20',
  },

  // ===== SEARCH SCENARIOS - Fuzzy (Typos) =====
  {
    name: 'search_fuzzy_cancer',
    endpoint: '/concepts/search/fulltext?q=canccer&pageSize=20',
  },
  {
    name: 'search_fuzzy_syndrome',
    endpoint: '/concepts/search/fulltext?q=syndrom&pageSize=20',
  },
  {
    name: 'search_fuzzy_engineering',
    endpoint: '/concepts/search/fulltext?q=enginering&pageSize=20',
  },

  // ===== SEARCH SCENARIOS - Field specific & Filters =====
  {
    name: 'search_label_acid',
    endpoint: '/concepts/search/fulltext?q=acid&fields=label&pageSize=20',
  },
  {
    name: 'search_level_deep',
    endpoint: '/concepts/search/fulltext?q=disease&level=5&pageSize=20',
  },

  // ===== SEARCH SCENARIOS - Edge Cases =====
  {
    name: 'search_no_results',
    endpoint: '/concepts/search/fulltext?q=xyznonexistent123&pageSize=20',
  },
  {
    name: 'search_very_long_query',
    endpoint:
      '/concepts/search/fulltext?q=systemic+disease+affecting+multiple+organs+and+tissues+in+the+human+body&pageSize=20',
  },

  // ===== NAVIGATION SCENARIOS =====
  { name: 'get_concept', endpoint: '/concepts/{conceptId}' },
  {
    name: 'get_children',
    endpoint: '/concepts/{parentWithManyChildren}/children?pageSize=20',
  },
  {
    name: 'get_children_page50',
    endpoint: '/concepts/{parentWithManyChildren}/children?pageSize=50',
  },
  { name: 'get_parents', endpoint: '/concepts/{childId}/parents?pageSize=20' },

  // ===== PATH COMPUTATION =====
  { name: 'paths_to_root', endpoint: '/concepts/{conceptId}/paths' },
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
  // Try multiple search queries to find concepts
  const queries = ['', 'a', 'e', 'i', 'o', 'the', 'science', 'system'];
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

  // Get first concept
  const conceptId = searchData.concepts[0].id;

  // Find a concept with many children by checking stats or using a known root
  // Try to find a level 0 or level 1 concept (likely has many children)
  const rootConcept =
    searchData.concepts.find((c: any) => c.level <= 1) ||
    searchData.concepts[0];
  const parentWithManyChildren = rootConcept.id;

  // Find a child concept (higher level)
  const childConcept =
    searchData.concepts.find((c: any) => c.level >= 2) ||
    searchData.concepts[1] ||
    searchData.concepts[0];
  const childId = childConcept.id;

  return { conceptId, parentWithManyChildren, childId };
}

async function runBenchmark(): Promise<BenchmarkResult[]> {
  console.log('🚀 Starting Benchmark Suite\n');
  console.log('='.repeat(70));

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
  console.log(
    `   Using parentWithManyChildren: ${sampleConcepts.parentWithManyChildren}`,
  );
  console.log(`   Using childId: ${sampleConcepts.childId}\n`);

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
    console.log(`   Max Depth: ${stats.maxDepth || 'N/A'}\n`);
  } catch (e) {
    console.log('⚠️  Could not fetch stats\n');
  }

  const results: BenchmarkResult[] = [];

  for (const scenario of SCENARIOS) {
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
  console.log('📊 BENCHMARK SUMMARY (Dataset: 635,968 nodes)');
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

  // Calculate averages
  const avgP50 = results.reduce((a, r) => a + r.p50, 0) / results.length;
  const avgP95 = results.reduce((a, r) => a + r.p95, 0) / results.length;

  console.log(
    `\n📈 Overall: avg p50 = ${avgP50.toFixed(1)}ms, avg p95 = ${avgP95.toFixed(1)}ms`,
  );
  console.log(
    `   Iterations per scenario: ${BENCHMARK_ITERATIONS} (+ ${WARMUP_ITERATIONS} warmup)`,
  );
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
