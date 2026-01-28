# DAG Project - Implementation Timeline (10-15h)

Roadmap chi tiết để hoàn thành DAG project trong 10-15 giờ với optimal order.

## Table of contenst

- [DAG Project - Implementation Timeline (10-15h)](#dag-project---implementation-timeline-10-15h)
  - [Table of contenst](#table-of-contenst)
  - [🎯 Overview](#-overview)
  - [⏱️ Phase 1: Setup \& Infrastructure (1.5-2h)](#️-phase-1-setup--infrastructure-15-2h)
    - [Step 1.1: Project Initialization (20 phút)](#step-11-project-initialization-20-phút)
    - [Step 1.2: Docker Compose Setup (30 phút)](#step-12-docker-compose-setup-30-phút)
    - [Step 1.3: Database Schema (20 phút)](#step-13-database-schema-20-phút)
    - [Step 1.4: NestJS Dependencies (20 phút)](#step-14-nestjs-dependencies-20-phút)
  - [🏗️ Phase 2: Backend Core Features (4-5h)](#️-phase-2-backend-core-features-4-5h)
    - [Step 2.1: DTOs \& Types (30 phút)](#step-21-dtos--types-30-phút)
    - [Step 2.2: Graph Service - CRUD (1h)](#step-22-graph-service---crud-1h)
    - [Step 2.3: Graph Traversal (1.5h)](#step-23-graph-traversal-15h)
    - [Step 2.4: Cycle Detection (45 phút)](#step-24-cycle-detection-45-phút)
    - [Step 2.5: Search Integration (1h)](#step-25-search-integration-1h)
    - [Step 2.6: REST API Endpoints (30 phút)](#step-26-rest-api-endpoints-30-phút)
  - [🎨 Phase 3: Frontend Core (3-4h)](#-phase-3-frontend-core-3-4h)
    - [Step 3.1: Project Setup (30 phút)](#step-31-project-setup-30-phút)
    - [Step 3.2: API Client (30 phút)](#step-32-api-client-30-phút)
    - [Step 3.3: Search Component (1h)](#step-33-search-component-1h)
    - [Step 3.4: Node Navigation (1h)](#step-34-node-navigation-1h)
    - [Step 3.5: Virtual Scrolling (1h)](#step-35-virtual-scrolling-1h)
  - [🧪 Phase 4: Testing \& Performance (1.5-2h)](#-phase-4-testing--performance-15-2h)
    - [Step 4.1: Import Sample Data (30 phút)](#step-41-import-sample-data-30-phút)
    - [Step 4.2: Performance Testing (45 phút)](#step-42-performance-testing-45-phút)
    - [Step 4.3: Basic Unit Tests (30 phút)](#step-43-basic-unit-tests-30-phút)
  - [🚀 Phase 5: Deployment \& Bonus (2h)](#-phase-5-deployment--bonus-2h)
    - [Step 5.1: CI/CD Setup (45 phút)](#step-51-cicd-setup-45-phút)
    - [Step 5.2: Deploy to Railway (30 phút)](#step-52-deploy-to-railway-30-phút)
    - [Step 5.3: Bonus Features (45 phút)](#step-53-bonus-features-45-phút)
  - [📝 Phase 6: Documentation (1h)](#-phase-6-documentation-1h)
    - [Sections](#sections)
  - [✅ Final Checklist](#-final-checklist)
  - [🎯 Time Management Tips](#-time-management-tips)
  - [📊 Expected Timeline](#-expected-timeline)
  - [🚦 Go/No-Go Decision Points](#-gono-go-decision-points)

## 🎯 Overview

- **Total time: 10-15 giờ**
- **Approach: Core first, bonus sau**
- **Philosophy: Working software > Perfect software**

## ⏱️ Phase 1: Setup & Infrastructure (1.5-2h)

**Mục tiêu:** Có môi trường development đầy đủ

### Step 1.1: Project Initialization (20 phút)

```bash
# Backend
npx @nestjs/cli new dag-api
cd dag-api

# Frontend
npm create vite@latest dag-ui -- --template vue-ts
cd dag-ui

# Git setup
git init
git remote add origin <your-repo>
```

**Deliverable:**

- ✅ NestJS project structure
- ✅ Vue 3 + TypeScript project
- ✅ Git repository

### Step 1.2: Docker Compose Setup (30 phút)

Copy docker-compose.yml từ architecture doc:

- MySQL Master (port 3306)
- Redis (port 6379)
- Elasticsearch (port 9200)

**Skip cho Phase 1:**

- ❌ MySQL Slaves (thêm sau nếu có time)
- ❌ Grafana/Prometheus (bonus)
- ❌ Kibana (bonus)

```bash
# Start minimal stack
docker-compose up -d mysql-master redis elasticsearch

# Verify
docker ps
mysql -h 127.0.0.1 -u root -p
redis-cli ping
curl [localhost:9200](http://localhost:9200)
```

**Deliverable:**

- ✅ MySQL running
- ✅ Redis running
- ✅ Elasticsearch running

### Step 1.3: Database Schema (20 phút)

Schema phải support data format từ concepts.json + edges.json:

```sql
-- Nodes table (from concepts.json)
CREATE TABLE nodes (
  id VARCHAR(36) PRIMARY KEY,  -- e.g., 'n_000001'
  label VARCHAR(255) NOT NULL,  -- e.g., 'Engineering'
  definition TEXT,               -- Long description
  level INT DEFAULT 0,           -- Hierarchy level
  variants JSON,                 -- Array of variant labels
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_label (label),
  INDEX idx_level (level),
  FULLTEXT INDEX idx_label_fulltext (label),
  FULLTEXT INDEX idx_definition_fulltext (definition)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Edges table (from edges.json)
CREATE TABLE edges (
  parent_id VARCHAR(36) NOT NULL,  -- First element in tuple
  child_id VARCHAR(36) NOT NULL,   -- Second element in tuple
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_id, child_id),
  INDEX idx_parent (parent_id),
  INDEX idx_child (child_id),
  FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Deliverable:**

- ✅ Tables created with definition + level fields
- ✅ Indexes added (including level)
- ✅ Foreign keys configured
- ✅ Full-text on label AND definition

### Step 1.4: NestJS Dependencies (20 phút)

```bash
# Prisma + Kysely (thay vì TypeORM)
npm install prisma @prisma/client
npm install kysely kysely-prisma
npm install mysql2

# Other dependencies
npm install @nestjs/elasticsearch @elastic/elasticsearch
npm install @nestjs/cache-manager cache-manager-redis-store

# Dev dependencies
npm install -D prisma-kysely
```

**Prisma setup:**

```bash
# Init Prisma
npx prisma init

# Edit .env
DATABASE_URL="mysql://root:[rootpass123@localhost:3306](mailto:rootpass123@localhost:3306)/dag_db"
```

**prisma/schema.prisma:**

```
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "fullTextIndex"]
}

generator kysely {
  provider = "prisma-kysely"
  output = "../src/generated"
  fileName = "types.ts"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Node {
  id         String   @id @db.VarChar(36)
  label      String   @db.VarChar(255)
  definition String?  @db.Text
  level      Int      @default(0)
  variants   Json?
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  parentsEdges   Edge[] @relation("ParentNode")
  childrenEdges  Edge[] @relation("ChildNode")

  @@index([label])
  @@index([level])
  @@fulltext([label])
  @@fulltext([definition])
  @@map("nodes")
}

model Edge {
  parentId  String   @map("parent_id") @db.VarChar(36)
  childId   String   @map("child_id") @db.VarChar(36)
  createdAt DateTime @default(now()) @map("created_at")

  parent Node @relation("ParentNode", fields: [parentId], references: [id], onDelete: Cascade)
  child  Node @relation("ChildNode", fields: [childId], references: [id], onDelete: Cascade)

  @@id([parentId, childId])
  @@index([parentId])
  @@index([childId])
  @@map("edges")
}
```

**Generate Prisma + Kysely types:**

```bash
npx prisma generate
npx prisma db push  # Create tables
```

Setup modules:

- PrismaModule (database client)
- KyselyModule (query builder)
- CacheModule (Redis)
- ElasticsearchModule

**src/prisma/prisma.service.ts:**

```tsx
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Kysely, MysqlDialect } from 'kysely';
import { createPool } from 'mysql2';
import { DB } from '../generated/types'; // Generated by prisma-kysely

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  public kysely: Kysely<DB>;

  constructor() {
    super();
    
    // Setup Kysely with same connection
    this.kysely = new Kysely<DB>({
      dialect: new MysqlDialect({
        pool: createPool({
          host: '[localhost](http://localhost)',
          port: 3306,
          user: 'root',
          password: 'rootpass123',
          database: 'dag_db',
        }),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
```

**Deliverable:**

- ✅ Prisma + Kysely installed
- ✅ Schema defined
- ✅ Types generated
- ✅ Connection verified

**⏰ Phase 1 checkpoint: 1.5-2h**

## 🏗️ Phase 2: Backend Core Features (4-5h)

**Mục tiêu:** API hoạt động với DAG operations

### Step 2.1: DTOs & Types (30 phút)

**Types tự động generate từ Prisma!** ✨

```tsx
// DTOs
// src/dto/create-node.dto.ts
import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';

export class CreateNodeDto {
  @IsString()
  id: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  definition?: string;

  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsArray()
  variants?: string[];
}

// src/dto/create-edge.dto.ts
export class CreateEdgeDto {
  @IsString()
  parentId: string;

  @IsString()
  childId: string;
}
```

**Types từ Prisma:**

```tsx
import { Node, Edge } from '@prisma/client';
// Tự động có type-safety!
```

**Deliverable:**

- ✅ Prisma types auto-generated
- ✅ DTOs với validation
- ✅ Full type-safety

### Step 2.2: Graph Service - CRUD (1h)

**Priority order:**

1. `createNode()` - Write to DB ✅
2. `getNode()` - Read from DB ✅
3. `createEdge()` - Write edge ✅
4. `deleteNode()` - Cascade delete ✅

**Với Prisma (simple operations):**

```tsx
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Node, Edge } from '@prisma/client';
import { CreateNodeDto } from '../dto/create-node.dto';

@Injectable()
export class GraphService {
  constructor(private prisma: PrismaService) {}

  // Simple CRUD - use Prisma
  async createNode(data: CreateNodeDto): Promise<Node> {
    return this.prisma.node.create({
      data: {
        id: [data.id](http://data.id),
        label: data.label,
        definition: data.definition,
        level: data.level ?? 0,
        variants: data.variants,
      },
    });
  }

  async getNode(id: string): Promise<Node | null> {
    return this.prisma.node.findUnique({
      where: { id },
      include: {
        parentsEdges: { include: { parent: true } },
        childrenEdges: { include: { child: true } },
      },
    });
  }

  async deleteNode(id: string): Promise<void> {
    await this.prisma.node.delete({ where: { id } });
    // Edges auto-deleted by cascade
  }

  async createEdge(parentId: string, childId: string): Promise<Edge> {
    // Check cycle first (see next step)
    const hasCycle = await this.detectCycle(parentId, childId);
    if (hasCycle) {
      throw new Error('Creating this edge would form a cycle');
    }

    return this.prisma.edge.create({
      data: { parentId, childId },
    });
  }
}
```

**Test ngay:**

```bash
curl -X POST [localhost:3000/api/nodes](http://localhost:3000/api/nodes) -d '{"label":"Test"}'
```

**Deliverable:**

- ✅ Basic CRUD working
- ✅ Manual testing passed

### Step 2.3: Graph Traversal (1.5h)

**Priority order:**

1. `getAncestors()` - Recursive CTE ⭐ Core requirement
2. `getDescendants()` - Recursive CTE ⭐ Core requirement
3. `getPathsToRoot()` - Multiple paths (bonus nếu có time)

**Với Kysely (complex queries):**

```tsx
import { sql } from 'kysely';

// Complex recursive queries - use Kysely for type-safety
async getAncestors(nodeId: string): Promise<Node[]> {
  // Kysely supports recursive CTEs with full type-safety!
  const result = await this.prisma.kysely
    .withRecursive('ancestors', (qb) =>
      qb
        .selectFrom('edges')
        .select(['parent_id', 'child_id'])
        .where('child_id', '=', nodeId)
        .unionAll(
          qb
            .selectFrom('edges as e')
            .innerJoin('ancestors as a', 'e.child_id', 'a.parent_id')
            .select(['e.parent_id', 'e.child_id'])
        )
    )
    .selectFrom('ancestors as a')
    .innerJoin('nodes as n', 'a.parent_id', '[n.id](http://n.id)')
    .selectAll('n')
    .distinct()
    .execute();

  return result as Node[];
}

async getDescendants(nodeId: string): Promise<Node[]> {
  const result = await this.prisma.kysely
    .withRecursive('descendants', (qb) =>
      qb
        .selectFrom('edges')
        .select(['parent_id', 'child_id'])
        .where('parent_id', '=', nodeId)
        .unionAll(
          qb
            .selectFrom('edges as e')
            .innerJoin('descendants as d', 'e.parent_id', 'd.child_id')
            .select(['e.parent_id', 'e.child_id'])
        )
    )
    .selectFrom('descendants as d')
    .innerJoin('nodes as n', 'd.child_id', '[n.id](http://n.id)')
    .selectAll('n')
    .distinct()
    .execute();

  return result as Node[];
}
```

**Test với sample data:**

```
Root
├── A
│   └── B
│       └── D
└── C
    └── D
```

**Deliverable:**

- ✅ Ancestors query working
- ✅ Descendants query working
- ✅ Tested với multi-parent DAG

### Step 2.4: Cycle Detection (45 phút)

**Critical feature!** Must prevent cycles.

```tsx
private async detectCycle(parentId: string, childId: string): Promise<boolean> {
  // Check if adding edge (parentId -> childId) would create cycle
  // by checking if childId can already reach parentId
  const result = await this.prisma.kysely
    .withRecursive('path', (qb) =>
      qb
        .selectFrom('edges')
        .select(['parent_id', 'child_id'])
        .where('parent_id', '=', childId) // Start from childId
        .unionAll(
          qb
            .selectFrom('edges as e')
            .innerJoin('path as p', 'e.parent_id', 'p.child_id')
            .select(['e.parent_id', 'e.child_id'])
        )
    )
    .selectFrom('path')
    .select(sql<number>`1`.as('exists'))
    .where('child_id', '=', parentId) // Can childId reach parentId?
    .limit(1)
    .execute();
  return result.length > 0;
}
```

**Deliverable:**

- ✅ Cycle detection working
- ✅ Cannot create cycles
- ✅ Error message clear

### Step 2.5: Search Integration (1h)

Elasticsearch cho full-text search:

```tsx
@Injectable()
export class SearchService {
  async indexNode(node: Node): Promise<void> { ... }
  async searchNodes(query: string): Promise<SearchResult> { ... }
}
```

**Hook vào GraphService:**

```tsx
async createNode(label: string) {
  const node = await [this.nodeRepo.save](http://this.nodeRepo.save)(...);
  await this.searchService.indexNode(node); // Auto-index
  return node;
}
```

**Deliverable:**

- ✅ Auto-indexing on create/update
- ✅ Search working với highlighting
- ✅ Fuzzy search working

### Step 2.6: REST API Endpoints (30 phút)

```tsx
@Controller('api')
export class GraphController {
  @Post('nodes') createNode() { ... }
  @Get('nodes/:id') getNode() { ... }
  @Post('edges') createEdge() { ... }
  @Get('nodes/:id/ancestors') getAncestors() { ... }
  @Get('nodes/:id/descendants') getDescendants() { ... }
  @Get('search') search() { ... }
}
```

**Test tất cả endpoints với Postman/curl.**

**Deliverable:**

- ✅ All REST endpoints working
- ✅ Error handling proper
- ✅ Response format consistent

**⏰ Phase 2 checkpoint: 4-5h** (total: 5.5-7h)

## 🎨 Phase 3: Frontend Core (3-4h)

**Mục tiêu:** Working UI với search + navigation

### Step 3.1: Project Setup (30 phút)

```bash
cd dag-ui
npm install
npm install @tanstack/vue-query pinia
npm install axios
npm install vue-virtual-scroller
```

Setup structure:

```
src/
├── components/
│   ├── SearchBar.vue
│   ├── NodeTree.vue
│   └── NodeDetail.vue
├── composables/
│   └── useNodes.ts
└── stores/
    └── graphStore.ts
```

**Deliverable:**

- ✅ Dependencies installed
- ✅ Project structure ready

### Step 3.2: API Client (30 phút)

```tsx
// services/api.ts
import axios from 'axios';
const api = axios.create({
  baseURL: '
```

**Deliverable:**

- ✅ API client configured
- ✅ CORS enabled on backend

### Step 3.3: Search Component (1h)

```
<!-- SearchBar.vue -->
<template>
  <div>
    <input 
      v-model="searchQuery" 
      @input="debouncedSearch"
      placeholder="Search nodes..."
    />
    <div v-if="results.length">
      <div v-for="node in results" :key="[node.id](http://node.id)" @click="selectNode(node)">
        <span v-html="node.highlight || node.label"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { useQuery } from '@tanstack/vue-query';

const searchQuery = ref('');
const { data: results } = useQuery({
  queryKey: ['search', searchQuery],
  queryFn: () => graphAPI.searchNodes(searchQuery.value),
});
</script>
```

**Deliverable:**

- ✅ Search input với debounce
- ✅ Results hiển thị với highlighting
- ✅ Click to select node

### Step 3.4: Node Navigation (1h)

Breadcrumb + ancestors visualization:

```
<!-- NodeDetail.vue -->
<template>
  <div>
    <!-- Breadcrumb -->
    <nav>
      <span v-for="ancestor in ancestors" :key="[ancestor.id](http://ancestor.id)">
         ancestor.label  /
      </span>
      <strong> currentNode.label </strong>
    </nav>
    
    <!-- Node info -->
    <div>
      <h2> currentNode.label </h2>
      <p>ID:  [currentNode.id](http://currentNode.id) </p>
    </div>
    
    <!-- Children -->
    <div v-if="children.length">
      <h3>Children:</h3>
      <div v-for="child in children" :key="[child.id](http://child.id)">
         child.label 
      </div>
    </div>
  </div>
</template>
```

**Deliverable:**

- ✅ Node detail view
- ✅ Breadcrumb navigation
- ✅ Children list

### Step 3.5: Virtual Scrolling (1h)

**Chỉ implement nếu còn time!**

```
<RecycleScroller
  :items="nodes"
  :item-size="50"
  key-field="id"
>
  <template #default="{ item }">
    <div> item.label </div>
  </template>
</RecycleScroller>
```

**Deliverable:**

- ✅ Smooth scrolling với 1000+ items
- ✅ Performance test passed

**⏰ Phase 3 checkpoint: 3-4h** (total: 8.5-11h)

## 🧪 Phase 4: Testing & Performance (1.5-2h)

**Mục tiêu:** Verify system works at scale

### Step 4.1: Import Sample Data (30 phút)

**Data format:**

- `concepts.json` - nodes với id, label, definition, level, variants
- `edges.json` - array of [parent_id, child_id] tuples

Import script:

```tsx
// scripts/import-data.ts
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { ElasticsearchService } from '@nestjs/elasticsearch';
const prisma = new PrismaClient();
interface Concept {
  id: string;          // e.g., "n_000001"
  label: string;       // e.g., "Engineering"
  definition: string;  // Long text
  level: number;       // Hierarchy level
  variants: string[];  // Alternative names
}
interface EdgeData {
  edges: [string, string][];  // [parent_id, child_id] tuples
}

  // 1. Load JSON files
  const conceptsData = JSON.parse(fs.readFileSync('concepts.json', 'utf-8'));
  const edgesData: EdgeData = JSON.parse(fs.readFileSync('edges.json', 'utf-8'));
  
  console.log(`Importing ${conceptsData.concepts.length} concepts...`);
  // 2. Import nodes in batches
  const batchSize = 1000;
  
  for (let i = 0; i < concepts.length; i += batchSize) {
    const batch = concepts.slice(i, i + batchSize);
    const nodes = 
```

**Usage:**

```bash
# Place concepts.json and edges.json in project root
ts-node scripts/import-data.ts
```

**Deliverable:**

- ✅ All concepts imported to MySQL
- ✅ All edges imported with cycle checking
- ✅ Elasticsearch indexed
- ✅ Import time logged

### Step 4.2: Performance Testing (45 phút)

**Test queries:**

```bash
# Search latency
time curl "[localhost:3000/api/search?q=node](http://localhost:3000/api/search?q=node)"
# Target: < 200ms

# Ancestors query
time curl "[localhost:3000/api/nodes/node-5000/ancestors](http://localhost:3000/api/nodes/node-5000/ancestors)"
# Target: < 100ms

# Load test
ab -n 1000 -c 10 [localhost:3000/api/search?q=test](http://localhost:3000/api/search?q=test)
```

**Deliverable:**

- ✅ Performance metrics documented
- ✅ Bottlenecks identified
- ✅ Screenshots saved

### Step 4.3: Basic Unit Tests (30 phút)

**Priority: test core logic only**

```tsx
// graph.service.spec.ts
describe('GraphService', () => {
  it('should detect cycles', async () => {
    await service.createEdge('A', 'B');
    await service.createEdge('B', 'C');
    await expect(
      service.createEdge('C', 'A')
    ).rejects.toThrow('cycle');
  });
  it('should find ancestors', async () => {
    const ancestors = await service.getAncestors('C');
    expect(ancestors).toContain('A', 'B');
  });
});
```

**Skip nếu hết time** - manual testing đủ cho demo.

**Deliverable:**

- ✅ Core features tested
- ✅ Cycle detection verified

**⏰ Phase 4 checkpoint: 1.5-2h** (total: 10-13h)

## 🚀 Phase 5: Deployment & Bonus (2h)

**Nếu còn time:**

### Step 5.1: CI/CD Setup (45 phút)

GitHub Actions:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm test
  deploy:
    needs: test
    steps:
      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
```

### Step 5.2: Deploy to Railway (30 phút)

```bash
railway login
railway init
railway add mysql
railway up
```

### Step 5.3: Bonus Features (45 phút)

**Pick ONE nếu còn time:**

- [ ]  MySQL Replication (2 slaves)
- [ ]  Grafana + OpenTelemetry
- [ ]  Multi-path breadcrumbs
- [ ]  Group identical labels in search

**⏰ Phase 5 checkpoint: 2h** (total: 12-15h)

## 📝 Phase 6: Documentation (1h)

**Report writing:**

### Sections

1. **Introduction** (10 phút)
    - Problem statement
    - Approach
2. **Architecture** (15 phút)
    - Diagram
    - Tech stack justification
    - Data modeling (DAG structure)
3. **Implementation** (15 phút)
    - Key algorithms (recursive CTE)
    - Cycle detection
    - Search strategy
4. **Performance** (15 phút)
    - Metrics at 100k nodes
    - Screenshots from Grafana/load tests
    - Bottleneck analysis
5. **Future Work** (5 phút)
    - Scaling strategy
    - Bonus features not implemented

**Deliverable:**

- ✅ PDF report (8-12 pages)
- ✅ Screenshots included
- ✅ Code on GitHub

## ✅ Final Checklist

**Core Requirements (Must have):**

- [ ]  Node CRUD operations
- [ ]  Edge creation với cycle detection
- [ ]  Ancestors/descendants queries (recursive)
- [ ]  Full-text search với ranking
- [ ]  Frontend: search + navigation
- [ ]  Performance: works with 100k nodes
- [ ]  Report: architecture + metrics

**Bonus (Nice to have):**

- [ ]  Virtual scrolling
- [ ]  Multi-path breadcrumbs
- [ ]  Group identical labels
- [ ]  MySQL replication
- [ ]  Grafana monitoring
- [ ]  CI/CD pipeline
- [ ]  Deployment (Railway/Render)

## 🎯 Time Management Tips

**If running out of time:**

1. **Cut first:**
    - MySQL slaves (single master OK)
    - Grafana/Prometheus (logging đủ)
    - Unit tests (manual testing OK)
    - Deployment (local demo OK)
2. **Keep:**
    - Core DAG operations
    - Cycle detection
    - Search functionality
    - Basic frontend
    - Performance testing
3. **Document what you didn't do:**
    - "Future work: Add MySQL replication for read scaling"
    - Shows you understand, just time-constrained

**If ahead of schedule:**

1. Add Grafana + OpenTelemetry (impressive!)
2. Deploy to Railway (live demo!)
3. Add more bonus features
4. Polish UI (animations, better styling)

## 📊 Expected Timeline

| Phase | Optimistic | Realistic | Pessimistic |
| --- | --- | --- | --- |
| 1. Setup | 1.5h | 2h | 3h |
| 2. Backend | 4h | 5h | 6h |
| 3. Frontend | 3h | 4h | 5h |
| 4. Testing | 1.5h | 2h | 3h |
| 5. Deployment | 1h | 2h | 3h |
| 6. Report | 1h | 1h | 2h |
| **Total** | **12h** | **16h** | **22h** |

**Target: 10-15h** → Focus on core, skip bonus if needed.

## 🚦 Go/No-Go Decision Points

**After Phase 2 (backend core):**

- ✅ Can call APIs manually → **GO to frontend**
- ❌ APIs not working → **STOP, debug backend**

**After Phase 3 (frontend):**

- ✅ Can search + navigate → **GO to testing**
- ❌ UI broken → **STOP, fix critical bugs**

**After Phase 4 (testing):**

- ✅ Performance acceptable → **GO to bonus/deploy**
- ❌ Too slow → **STOP, optimize queries**

---

**Start with Phase 1, commit after each phase!** 🚀
