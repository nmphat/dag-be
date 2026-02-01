# Wikidata Data Generation & Import Pipeline

This project includes a powerful pipeline to crawl massive amounts of hierarchical data (concepts and edges) from Wikidata and import it into the local database (MariaDB) and search engine (Elasticsearch).

## 1. Generation: `gen-from-wikidata.ts`

The script `be/scripts/gen-from-wikidata.ts` is designed for massive, automated data collection.

### Overview
- **Automated Root Discovery**: Instead of hardcoding categories, the script queries Wikidata for ~500 significant and diverse classes (e.g., specific types of diseases, chemical compounds, organizations).
- **Sequential Processing**: It processes one root category at a time to stay within API limits and ensure data variety.
- **Subfolder Export**: Every root category gets its own subfolder in `docs/sample-data/from-wikidata/`.
- **Hierarchical Expansion**: Uses the `subclass of` (P279) relationship to build deep taxonomies.

### How to Run
```bash
pnpm gen-from-wikidata
```
The script will run indefinitely (or until manual termination), crawling as much data as possible.

### Output Structure
```text
docs/sample-data/from-wikidata/
├── genetic_disease_q200779/
│   ├── concepts.json
│   └── edges.json
├── film_q11424/
│   ├── concepts.json
│   └── edges.json
└── imported.txt (Tracks categories already imported to DB)
```

## 2. Import: `import-sample-data.ts`

The script `be/scripts/import-sample-data.ts` handles the ingestion of generated data.

### Key Features
- **Incremental Imports**: It checks `imported.txt` and only processes new folders that haven't been imported yet.
- **Multi-Store Support**: Simultaneously imports data into MariaDB (SQL) and indexes it in Elasticsearch.
- **Idempotent**: Uses `INSERT IGNORE` to prevent duplicate records if scripts are re-run.

### How to Run
**Import all new folders:**
```bash
pnpm db:import
```

**Import a specific folder only:**
```bash
pnpm ts-node scripts/import-sample-data.ts <folder_name>
```

## 3. Data Mapping & Structure

The pipeline transforms raw Wikidata SPARQL results into a flattened JSON structure optimized for SQL and Elasticsearch.

### SPARQL Response Fields
The crawler requests the following fields from the Wikidata Query Service:
- `?child`: The unique URI of the concept (e.g., `http://www.wikidata.org/entity/Q12136`).
- `?parent`: The URI of the parent concept (linked via P279 "subclass of").
- `?childLabel`: The primary English label.
- `?childDescription`: The primary English description.
- `?alts`: A concatenated string of English aliases, separated by a pipe `|`.

### Field Mapping Logic

| Source (Wikidata) | Target (Local JSON) | Transformation Logic |
| :--- | :--- | :--- |
| `?child` (URI) | `id` | Extracted QID bhash-summed to a stable 10-char "C-prefix" ID (e.g., `C7ba878b9b`). |
| `?childLabel` | `label` | Clamped to 255 chars. Defaults to QID if label is missing. |
| `?childDescription`| `definition` | Combined with QID: `${desc} (wd:${qid})`. |
| `?alts` | `variants` | Split by `|`, clamped to 255 chars, and limited to top 5 aliases. |
| (BFS Depth) | `level` | Hierarchical depth determined by the crawler relative to the root category. |

### Output JSON Format
Both `concepts.json` and `edges.json` use a flat array format:

**concepts.json:**
```json
[
  {"id":"C123","label":"Example","definition":"Desc (wd:Q123)","level":1,"variants":["Var1","Var2"]},
  ...
]
```

## 4. Troubleshooting

### 504 Upstream Request Timeout
When crawling Wikidata, you may occasionally see:
`Error: WDQS error 504: upstream request timeout`

**Reason**: The Wikidata Query Service is overloaded or the specific query took too long.
**Solution**: The script is designed to handle this. It will automatically log the error, wait 2 seconds, and skip to the next batch or root. **No action is needed.**

### Missing Closures in JSON (SyntaxError during Import)
If the crawler script is killed while writing, the `.json` files might remain open (missing `]`). The import script will report a `SyntaxError`.
**Fix**:
1. Check the last line of the reported JSON file.
2. Manually add a `]` to close the array.
3. Or delete that root folder and let the crawler regenerate it.
