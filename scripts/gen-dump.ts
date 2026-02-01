/**
 * gen-1m-concepts.ts
 *
 * Usage:
 *  1) npm i -D tsx
 *  2) npx tsx gen-1m-concepts.ts
 *
 * Output:
 *  - ./concepts.json
 *  - ./edges.json
 */

import fs from 'node:fs';
import path from 'node:path';

type ConceptOut = {
  id: string; // VarChar(10)
  label: string; // VarChar(255)
  definition?: string | null; // Text
  level: number; // Int
  variants: string[]; // mapped to Variant rows later if you want
};

type EdgeOut = {
  parentId: string; // VarChar(10)
  childId: string; // VarChar(10)
};

const OUT_DIR = process.cwd();
const CONCEPTS_FILE = path.join(
  OUT_DIR,
  'docs/sample-data/gen-dump/concepts.json',
);
const EDGES_FILE = path.join(OUT_DIR, 'docs/sample-data/gen-dump/edges.json');

// ---- Config ----
const TOTAL = 1_000_000;

// how many roots at level 0
const ROOTS = 1_000;

// create some very deep chains to simulate recursion-friendly graphs
const DEEP_CHAINS = 50;
const DEEP_CHAIN_LENGTH = 2_000; // 50 * 2000 = 100k nodes in deep chains

// remaining nodes go to a broad-ish forest under roots
// each new node will choose a parent mostly from recent nodes to keep height reasonable,
// except for deep chains
const VARIANTS_MAX = 3; // variants per concept: 0..3
const EDGE_EXTRA_RATE = 0.02; // add a small number of extra edges (DAG-safe) for cross-links
const RNG_SEED = 42;

// ---- Simple deterministic RNG ----
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(RNG_SEED);

function id10(n: number) {
  // n: 0..999_999
  // "C" + 9 digits = 10 chars total
  return 'C' + String(n).padStart(9, '0');
}

function pickInt(maxExclusive: number) {
  return Math.floor(rand() * maxExclusive);
}

function maybeNull<T>(value: T, nullRate: number): T | null {
  return rand() < nullRate ? null : value;
}

function makeLabel(i: number, level: number) {
  // Keep within 255 chars
  return `Concept ${i} (L${level})`;
}

function makeDefinition(i: number) {
  // Optional Text
  return maybeNull(`Definition for concept ${i}.`, 0.25);
}

function makeVariants(i: number) {
  const k = pickInt(VARIANTS_MAX + 1); // 0..3
  const arr: string[] = [];
  for (let j = 0; j < k; j++) {
    // keep under 255 chars
    arr.push(`Concept ${i} alt ${j + 1}`);
  }
  return arr;
}

// streaming JSON array writer
class JsonArrayWriter<T> {
  private stream: fs.WriteStream;
  private first = true;

  constructor(filePath: string) {
    this.stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    this.stream.write('[\n');
  }

  write(item: T) {
    const s = JSON.stringify(item);
    if (!this.first) this.stream.write(',\n');
    this.stream.write(s);
    this.first = false;
  }

  end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.write('\n]\n');
      this.stream.end();
      this.stream.on('finish', () => resolve());
      this.stream.on('error', (e) => reject(e));
    });
  }
}

async function main() {
  console.log(`Generating ${TOTAL.toLocaleString()} concepts...`);

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(CONCEPTS_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(EDGES_FILE), { recursive: true });

  const conceptsWriter = new JsonArrayWriter<ConceptOut>(CONCEPTS_FILE);
  const edgesWriter = new JsonArrayWriter<EdgeOut>(EDGES_FILE);

  // We'll build parents based on indices to keep DAG (parent index < child index).
  // Keep an array of representative nodes for each level to make tree-ish structure.
  // To keep memory low: store just some recent node indices.
  const recentWindow: number[] = [];
  const RECENT_MAX = 200_000;

  // Track level of nodes (needed to output Concept.level and also generate plausible edges)
  // For 1M, storing Int32Array is fine (~4MB)
  const levelByIndex = new Int32Array(TOTAL);

  // ---- Create ROOTS ----
  for (let i = 0; i < ROOTS; i++) {
    const idx = i;
    const level = 0;
    levelByIndex[idx] = level;

    conceptsWriter.write({
      id: id10(idx),
      label: makeLabel(idx, level),
      definition: makeDefinition(idx),
      level,
      variants: makeVariants(idx),
    });

    recentWindow.push(idx);
  }

  // ---- Deep chains to force recursive traversals ----
  // Each chain starts from an existing root.
  let nextIndex = ROOTS;
  for (let c = 0; c < DEEP_CHAINS; c++) {
    const chainRootIdx = pickInt(ROOTS); // pick a root as chain parent
    let parentIdx = chainRootIdx;

    for (let step = 0; step < DEEP_CHAIN_LENGTH && nextIndex < TOTAL; step++) {
      const idx = nextIndex++;
      const level = levelByIndex[parentIdx] + 1;
      levelByIndex[idx] = level;

      conceptsWriter.write({
        id: id10(idx),
        label: `DeepChain ${c} Step ${step} (L${level})`,
        definition: maybeNull(`Part of deep chain ${c}, step ${step}.`, 0.1),
        level,
        variants: makeVariants(idx),
      });

      // backbone edge parent -> child
      edgesWriter.write({
        parentId: id10(parentIdx),
        childId: id10(idx),
      });

      // small chance to add an extra edge from an ancestor in the same chain (still DAG-safe)
      // to create "diamond" shapes for recursion tests, without cycles.
      if (step > 10 && rand() < 0.05) {
        const jumpBack = 1 + pickInt(Math.min(step, 200)); // choose an ancestor
        const ancestorIdx = idx - jumpBack;
        if (ancestorIdx > parentIdx) {
          edgesWriter.write({
            parentId: id10(ancestorIdx),
            childId: id10(idx),
          });
        }
      }

      parentIdx = idx;

      recentWindow.push(idx);
      if (recentWindow.length > RECENT_MAX) recentWindow.shift();
    }
  }

  // ---- Remaining nodes: broad-ish forest ----
  while (nextIndex < TOTAL) {
    const idx = nextIndex++;

    // choose parent among:
    // - mostly recent nodes (creates local hierarchy, reasonable depth)
    // - sometimes a root (keeps some branches shallow)
    let parentIdx: number;
    const r = rand();
    if (r < 0.15) {
      parentIdx = pickInt(ROOTS);
    } else {
      parentIdx = recentWindow[pickInt(recentWindow.length)];
    }

    const parentLevel = levelByIndex[parentIdx];
    // keep depth from exploding outside deep chains
    const level = Math.min(parentLevel + 1, 30);
    levelByIndex[idx] = level;

    conceptsWriter.write({
      id: id10(idx),
      label: makeLabel(idx, level),
      definition: makeDefinition(idx),
      level,
      variants: makeVariants(idx),
    });

    // backbone edge
    edgesWriter.write({
      parentId: id10(parentIdx),
      childId: id10(idx),
    });

    // Extra edges (still DAG-safe): parent from earlier index only
    // Creates more complex recursion paths but avoids cycles by enforcing srcIndex < dstIndex.
    if (rand() < EDGE_EXTRA_RATE) {
      // pick a second parent from earlier nodes (not necessarily ancestor)
      const candidateIdx = pickInt(idx); // ensures < idx
      if (candidateIdx !== parentIdx) {
        edgesWriter.write({
          parentId: id10(candidateIdx),
          childId: id10(idx),
        });
      }
    }

    recentWindow.push(idx);
    if (recentWindow.length > RECENT_MAX) recentWindow.shift();

    if (idx > 0 && idx % 50_000 === 0) {
      console.log(`Produced: ${idx.toLocaleString()} concepts...`);
    }
  }

  await conceptsWriter.end();
  await edgesWriter.end();

  console.log(`Done.
- ${CONCEPTS_FILE}
- ${EDGES_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
