# [COL] First Task for Fullstack Developer

## Introduction

At Concepedia, we are building a data-driven encyclopedia that organizes the world’s knowledge into a logical, meaningful, and intuitive concept hierarchy.

A **concept** is the underlying idea (e.g., *Database Systems*). Concepts form a hierarchy where concepts higher in the tree are broader, and concepts deeper in the tree are narrower (more specific).

An **edge** represents a parent → child relationship: the parent is the broader concept, and the child is a more specific sub-concept (an “is-a / subtopic-of” relation).  
Example:  
`Database Systems → Transaction Management → Concurrency Control`

In practice, this hierarchy is not always a strict tree: some concepts can have multiple parents, so the structure is a **DAG (directed acyclic graph)**.

A high-quality taxonomy is only useful if people can actually inspect it, debug it, and navigate it quickly. Internally, we constantly need to:

- search for a concept by label,
- open it and read its definition / metadata,
- navigate to parents / children,
- understand where it sits in the hierarchy (and how many paths lead to it),
- do this efficiently even when the taxonomy is very large (100k → 1m nodes).

That is the purpose of this first task.

---

## Task: Build a Taxonomy Explorer (FE + BE)

### Goal

You are given a taxonomy dataset (concept nodes + parent/child edges). Your job is to build a small web application that supports fast navigation and search over the hierarchy.

---

## Requirements

### Frontend

- Responsive and fast (mobile + desktop).
- Drill-down navigation (parents/children) with deep-linkable routes  
  (URL should represent the current selection).
- Search over label + variants:
  - Support prefix search at a minimum.
  - Do not assume labels are unique (results must be keyed by id and must not drop nodes).
  - When multiple results share the same label,  show disambiguation context  
    (e.g., parent(s), level, and/or paths).
- Concept detail view:
  - Definition (when present).
  - Parents + children.
  - Multiple parent paths (a node can appear in multiple places in the hierarchy).
- Meaningful interaction beyond “click a list”:
  - Keyboard shortcuts and/or command palette.
  - Filtering (e.g., by level).
  - Favorites/pinning and quick switching (optional but recommended).

### Backend

- Ingests all the data and serves the UI efficiently.
- Exposes APIs needed by the frontend (search + graph navigation) with pagination.
- Supports large data volumes (design for 100k → 1m nodes).
- Should not require loading the entire dataset into memory per request.

---

## Scaling

- Provide a script or endpoint to scale the dataset to ~1,000,000 nodes (same schema).
- You can generate fake nodes and edges — this is just a scaling test.
- Report performance before/after scaling:
  - ingest/index time,
  - memory footprint (rough estimate is fine),
  - search latency (p50/p95),
  - one navigation endpoint latency (e.g., children lookup).
- Explain the tradeoffs you made:
  - precompute vs compute-on-demand,
  - index choices,
  - caching strategy.

---

## Data, Constraints, and Tools

You can access the data here: **LINK**

### Input files

- **concepts.json**: includes a list of concepts, each concept has:
  - id
  - label
  - level
  - definition
  - list of alternative names
- **edges.json**: includes a list of edges between 2 concepts  
  Each edge is `[parent_id, child_id]`.

Interpret parent → child as **subfield-of**  
(“child is more specific than parent”).

Nodes can have multiple parents (DAG).

### Data caveats (intentional)

- Duplicate labels exist (same label, different id).
- Some fields may be sparse or simplified (e.g., definitions).
- Do not do semantic deduplication/merging or remove any concept;  
  treat the dataset as authoritative.

You can use any stack you are comfortable with (frontend + backend).  
The goal is not to “use our preferred framework,” but to demonstrate that you can build a clean, scalable, end-to-end system with thoughtful tradeoffs.

If you create intermediate datasets, build a new database, indexes, or artifacts, describe them in the report.  
You may use external references if needed; cite key sources briefly.

We expect that this task will take you **10–15 hours** if you are familiar with the related tools/techniques.

---

## Bonus Goals (Optional)

Pick what’s interesting; do not feel obligated to do all of them:

- Full-text search with ranking + highlighting (not just substring match).
- Group identical labels in search results (while still allowing selection of distinct ids).
- A “paths to root” viewer for multi-parent nodes (multiple breadcrumbs).
- Virtualized lists and/or incremental loading to keep the UI snappy with huge result sets.
- Caching strategy (server-side and/or client-side) with a clear invalidation story.
- Observability: basic metrics (timers, request logging) and performance screenshots in the report.

---

## Deliverables

You should submit **only one report (PDF)**.

We know there is not a single “correct” implementation. We care more about sound engineering judgement than using any specific framework, especially:

- **Product thinking**: is the UI optimized for “find what I need quickly”?
- **Data modeling**: do your structures fit a DAG (not just a tree)?
- **Performance**: is the system still usable at ~1m nodes, and can you explain why?
- **Code quality**: clarity, correctness, tests (where appropriate), maintainability.
- **Communication**: does your report make your decisions easy to understand?

---

## Timeline and Submission

Please email the PDF report to:

- `<thanhphong.vo@cazoodle.com>`  
- CC: `<kevin.chang@cazoodle.com>`

Please submit within **1–2 weeks**.  
If you need more time, email us.

If you pass this round, you will present a **live demo** in the next meeting.
