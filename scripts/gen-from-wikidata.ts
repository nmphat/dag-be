/**
 * gen-from-wikidata.ts
 * Node 18+ (global fetch)
 *
 * Massive crawl: Finds hundreds of roots and exports each's taxonomy to a subfolder.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ProxyAgent } from 'undici';

type ConceptOut = {
  id: string; // VarChar(10) in Prisma
  label: string; // VarChar(255)
  definition?: string | null; // Text
  level: number;
  variants: string[];
};

type EdgeOut = {
  parentId: string;
  childId: string;
};

const BASE_OUT_DIR = path.join(process.cwd(), 'docs/sample-data/from-wikidata');

// Max concepts per root to ensure variety
const MAX_PER_ROOT = 50_000;

// SPARQL endpoint (Wikidata Query Service)
const WDQS = 'https://query.wikidata.org/sparql';

// You MUST set a user agent per Wikidata policy
const USER_AGENT =
  'ConceptGraphGenerator/1.1 (contact: nmphat01062001@gmail.com)';

class JsonArrayWriter<T> {
  private stream: fs.WriteStream;
  private first = true;

  constructor(filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    this.stream.write('[\n');
  }

  write(item: T) {
    const s = JSON.stringify(item);
    if (!this.first) this.stream.write(',\n');
    this.stream.write(s);
    this.first = false;
  }

  async end(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.stream.write('\n]\n');
      this.stream.end();
      this.stream.on('finish', () => resolve());
      this.stream.on('error', (e) => reject(e));
    });
  }
}

function qidToId10(qid: string) {
  const h = crypto.createHash('sha1').update(qid).digest('hex');
  return 'C' + h.slice(0, 9);
}

function iriToQid(iri: string) {
  const m = iri.match(/\/(Q\d+)$/);
  return m ? m[1] : iri;
}

function clampLabel(s: string, max = 255) {
  if (!s) return 'Unknown';
  return s.length > max ? s.slice(0, max - 1) : s;
}

function sanitizeDirName(s: string) {
  return s
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .slice(0, 50);
}

async function sparql(query: string) {
  const url = new URL(WDQS);
  url.searchParams.set('format', 'json');
  url.searchParams.set('query', query);

  const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
    },
    // @ts-ignore - undici dispatcher is supported in Node 18+ fetch
    dispatcher,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403) {
      console.error(
        `\n🛑 CRITICAL: Wikidata Forbidden (403). Your IP might be blocked or User-Agent is rejected.`,
      );
      console.error(`Response: ${text.slice(0, 300)}`);
      process.exit(1); // Immediate stop to protect IP
    }
    throw new Error(`WDQS error ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as any;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Finds interesting root classes to expand from.
 * Looks for subclass of 'entity' (Q35120) or other broad categories.
 */
async function findRoots(
  limit = 300,
): Promise<Array<{ qid: string; label: string }>> {
  console.log('Searching for root categories...');
  const query = `
SELECT ?item ?itemLabel (COUNT(?sub) AS ?subCount)
WHERE {
  ?item wdt:P279 ?broad .
  VALUES ?broad { wd:Q35120 wd:Q223557 wd:Q15184 wd:Q11173 wd:Q12136 }
  ?sub wdt:P279 ?item .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?item ?itemLabel
HAVING(?subCount > 2)
ORDER BY DESC(?subCount)
LIMIT ${limit}
`.trim();

  try {
    const res = await sparql(query);
    return res.results.bindings.map((b: any) => ({
      qid: iriToQid(b.item.value),
      label: b.itemLabel.value,
    }));
  } catch (e) {
    console.error('Failed to find roots, using defaults.', e);
    return [
      { qid: 'Q5', label: 'human' },
      { qid: 'Q6256', label: 'country' },
      { qid: 'Q11424', label: 'film' },
    ];
  }
}

async function processRoot(rootQid: string, rootLabel: string) {
  const dirName = sanitizeDirName(`${rootLabel}_${rootQid}`);
  const rootDir = path.join(BASE_OUT_DIR, dirName);
  const CONCEPTS_FILE = path.join(rootDir, 'concepts.json');
  const EDGES_FILE = path.join(rootDir, 'edges.json');

  if (fs.existsSync(CONCEPTS_FILE)) {
    console.log(`Skipping ${rootLabel} (${rootQid}), already exists.`);
    return;
  }

  console.log(`\n--- Processing Root: ${rootLabel} (${rootQid}) ---`);
  const conceptsWriter = new JsonArrayWriter<ConceptOut>(CONCEPTS_FILE);
  const edgesWriter = new JsonArrayWriter<EdgeOut>(EDGES_FILE);

  const qidSeen = new Set<string>();
  const levelByQid = new Map<string, number>();
  const queue: Array<{ qid: string; level: number }> = [];

  // Init root
  qidSeen.add(rootQid);
  levelByQid.set(rootQid, 0);
  queue.push({ qid: rootQid, level: 0 });

  conceptsWriter.write({
    id: qidToId10(rootQid),
    label: rootLabel,
    definition: `Root Wikidata concept ${rootQid}`,
    level: 0,
    variants: [],
  });

  let produced = 1;
  let lastLoggedProduced = 0;
  const BATCH_PARENTS = 50;
  const RATE_LIMIT_MS = 300;

  while (queue.length && produced < MAX_PER_ROOT) {
    const batch = queue.splice(0, BATCH_PARENTS);
    const parentQids = batch.map((x) => x.qid);
    const values = parentQids.map((q) => `wd:${q}`).join(' ');

    const query = `
SELECT ?child ?parent ?childLabel ?childDescription (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)
WHERE {
  VALUES ?parent { ${values} } .
  ?child wdt:P279 ?parent .
  OPTIONAL { ?child rdfs:label ?childLabel . FILTER(LANG(?childLabel) = "en") }
  OPTIONAL { ?child skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
  OPTIONAL { ?child schema:description ?childDescription . FILTER(LANG(?childDescription) = "en") }
}
GROUP BY ?child ?parent ?childLabel ?childDescription
LIMIT 1000
`.trim();

    try {
      const data = await sparql(query);
      const rows = data?.results?.bindings ?? [];

      if (rows.length > 0) {
        console.log(
          `   [${rootLabel}] Batch size: ${parentQids.length} parents -> Found ${rows.length} children`,
        );
      }

      for (const row of rows) {
        if (produced >= MAX_PER_ROOT) break;

        const childQ = iriToQid(row.child.value);
        const parentQ = iriToQid(row.parent.value);

        edgesWriter.write({
          parentId: qidToId10(parentQ),
          childId: qidToId10(childQ),
        });

        if (qidSeen.has(childQ)) continue;

        const parentLevel = levelByQid.get(parentQ) ?? 0;
        const childLevel = parentLevel + 1;

        qidSeen.add(childQ);
        levelByQid.set(childQ, childLevel);
        queue.push({ qid: childQ, level: childLevel });

        const label = clampLabel(row.childLabel?.value ?? childQ);
        const desc = row.childDescription?.value ?? null;
        const altsRaw = row.alts?.value ?? '';
        const variants =
          altsRaw.length > 0
            ? altsRaw
                .split('|')
                .map((s: string) => clampLabel(s))
                .slice(0, 5)
            : [];

        conceptsWriter.write({
          id: qidToId10(childQ),
          label,
          definition: desc
            ? `${desc} (wd:${childQ})`
            : `Wikidata concept ${childQ}`,
          level: childLevel,
          variants,
        });

        produced++;
      }

      if (produced - lastLoggedProduced >= 100) {
        lastLoggedProduced = produced;
        const queueSize = queue.length;
        console.log(
          `   🚀 [${rootLabel}] Total Produced: ${produced.toLocaleString()} | Queue Size: ${queueSize}`,
        );
      }

      await sleep(RATE_LIMIT_MS);
    } catch (e) {
      console.error(`Error in batch for ${rootLabel}:`, e);
      await sleep(2000);
    }
  }

  // Add one manual concept per folder to ensure data
  conceptsWriter.write({
    id: qidToId10(`MANUAL_${rootQid}`),
    label: `Manual ${rootLabel} Concept`,
    definition: `A manually created concept for the ${rootLabel} taxonomy.`,
    level: 0,
    variants: ['Sample'],
  });

  await conceptsWriter.end();
  await edgesWriter.end();
  console.log(`Finished ${rootLabel}: ${produced.toLocaleString()} concepts.`);
}

async function main() {
  const roots = await findRoots(500);
  console.log(`Found ${roots.length} roots to process.`);

  for (const root of roots) {
    try {
      await processRoot(root.qid, root.label);
    } catch (e) {
      console.error(`Failed to process root ${root.label}:`, e);
    }
  }

  console.log('\n--- All roots processed! ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
