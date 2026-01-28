# Materialized Paths: Deep Trade-off Analysis

## 📊 Current Baseline (100K Nodes)

```
Database:  100,000 nodes, 117,809 edges
Structure: Avg depth 3.93, max children 353
Current:   edges table = 21.58 MB
```

---

## 🎯 Option C: Full Materialized Paths

### Storage Model

```sql
CREATE TABLE node_paths (
  ancestor_id VARCHAR(50),
  descendant_id VARCHAR(50),
  depth INT,
  PRIMARY KEY (ancestor_id, descendant_id),
  INDEX idx_descendant (descendant_id, depth)
);
```

### Storage Calculation

**100K Nodes:**

- **Rows needed:** ~493,000
  - Logic: Each node × avg ancestors (3.93) + self-references
  - Root alone: 99,999 descendants × 3.93 avg depth = 393,000 paths
- **Storage:** 143 MB (data + indexes)
- **Overhead:** +121 MB vs current (+562%)
- **Ratio:** 6.6x larger than edges table

**1M Nodes (10x scale):**

- **Rows needed:** ~5.9 million
- **Storage:** 1.7 GB
- **Overhead:** +1.5 GB vs scaled edges table
- **Ratio:** Still ~6.6x (linear scaling factor)

**Why not 10x?** Paths grow super-linearly because:

- More nodes = more ancestors per node
- Deeper trees = exponentially more paths
- Growth rate: O(n × log n) to O(n^1.5)

---

## ⚡ Performance Comparison

### Read Performance (Descendants Query)

| Scenario | CTE Approach | Materialized Paths | Speedup |
|----------|--------------|-------------------|---------|
| Root (99,999 nodes) | 26.0 seconds | <0.05 seconds | **520x** |
| Mid-level (4,060 nodes) | 0.2 seconds | <0.05 seconds | **4x** |
| Small (20 nodes) | 0.05 seconds | <0.05 seconds | 1x |

**Query Complexity:**

- CTE: `O(result_size × depth)` - recursive traversal
- Paths: `O(1)` or `O(log n)` - simple indexed SELECT

**Example Query:**

```sql
-- Materialized: Simple index lookup
SELECT descendant_id, depth 
FROM node_paths 
WHERE ancestor_id = 'n_000001' 
ORDER BY depth;
-- Execution: <50ms regardless of result size
```

### Write Performance (Add/Delete Edge)

| Operation | CTE Approach | Materialized Paths | Impact |
|-----------|--------------|-------------------|--------|
| Add edge | 1 INSERT (~5ms) | Recompute paths | **400-1000x slower** |
| Delete edge | 1 DELETE (~5ms) | Delete + recompute | **400-1000x slower** |
| Update node | 1 UPDATE (~5ms) | No impact | 1x |

**Write Complexity:**

- CTE: `O(1)` - single row operation
- Paths: `O(ancestors × descendants)` - update entire subgraph

**Concrete Example:**
Adding edge under node with 4,060 descendants:

```
CTE:                 1 INSERT = 5ms
Materialized Paths:  16,000 path updates = 2-5 seconds
```

---

## 📈 Scaling Analysis

### Database Growth Projection

| Dataset | Edges Table | Paths Table | Total DB | Overhead |
|---------|-------------|-------------|----------|----------|
| 100K nodes | 22 MB | 143 MB | 165 MB | **6.5x** |
| 500K nodes | 108 MB | 715 MB | 823 MB | **6.6x** |
| 1M nodes | 216 MB | 1,715 MB | 1,931 MB | **7.9x** |
| 5M nodes | 1,080 MB | 12,000 MB | 13,080 MB | **11.1x** |

**Key Insight:** Storage overhead is manageable up to 1M nodes but becomes significant at 5M+.

### Query Time Scaling

**Current CTE Approach:**

```
Descendants Query Time ≈ result_size × 0.26ms per node

100K dataset:
  - 100 descendants: 26ms ✅
  - 1,000 descendants: 260ms ✅
  - 10,000 descendants: 2.6s ⚠️
  - 100,000 descendants: 26s ❌

1M dataset (projected):
  - 100 descendants: 26ms ✅
  - 10,000 descendants: 5-10s ❌
  - 1M descendants: 260s+ ❌
```

**Materialized Paths:**

```
ANY query: <50ms (constant time)
```

---

## 🔄 Consistency & Maintenance

### CTE Approach (Current)

✅ **Always consistent** - no cached state  
✅ **Zero maintenance** - query computes fresh  
✅ **Simple architecture** - stateless  
❌ **Slow for large results** - recomputes every time  

### Materialized Paths

✅ **Extremely fast reads** - precomputed  
❌ **Complex maintenance** - must update on every edge change  
❌ **Consistency risks** - if update fails, paths become stale  
❌ **Transaction complexity** - need careful locking  

**Maintenance Strategies:**

1. **Database Triggers** (automatic but risky):

   ```sql
   DELIMITER $$
   CREATE TRIGGER after_edge_insert
   AFTER INSERT ON edges
   FOR EACH ROW BEGIN
     -- Recompute all paths affected by new edge
     -- Complex logic, potential for deadlocks
   END$$
   ```

2. **Application-Level** (explicit control):

   ```typescript
   async addEdge(parentId: string, childId: string) {
     await this.prisma.$transaction(async (tx) => {
       // 1. Insert edge
       await tx.edge.create({ data: { parentId, childId }});
       
       // 2. Recompute paths
       await this.recomputePathsForSubtree(childId, tx);
     });
   }
   ```

3. **Async Queue** (eventual consistency):

   ```typescript
   // Fast write, slow consistency
   await this.edgeRepo.create(edge);
   await this.queue.add('recompute-paths', { nodeId: edge.childId });
   ```

---

## ⚠️ Edge Cases & Risks

### 1. Circular Reference Protection

Current CTE has cycle detection. Materialized paths can create infinite loops if not careful:

```typescript
// Must check BEFORE inserting edge
if (await this.wouldCreateCycle(parentId, childId)) {
  throw new Error('Circular reference detected');
}
```

### 2. Deep Tree Writes

Node at depth 10 with 50,000 descendants:

- Paths to update: 50,000 × 10 ancestors = 500,000 rows
- Time: 10-30 seconds per write
- Solution: Queue async, return immediate confirmation

### 3. Concurrent Writes

Two edges added simultaneously can cause race conditions:

```
Thread A: Add edge X→Y, starts path recomputation
Thread B: Add edge Y→Z, starts path recomputation
Result: Inconsistent paths if not properly locked
```

### 4. Storage Explosion

If graph becomes very interconnected (high fan-out):

```
10 nodes fully connected: 10² = 100 paths
100 nodes fully connected: 100² = 10,000 paths
1,000 nodes fully connected: 1M paths = massive storage
```

---

## 💡 Recommendation: Hybrid Approach

### **Option D: Smart Caching (RECOMMENDED)**

Instead of full materialization, use Redis for selective caching:

```typescript
// Fast path: Check cache
const cached = await redis.get(`descendants:${nodeId}`);
if (cached) return JSON.parse(cached); // <5ms

// Slow path: Compute with CTE + cache result
const result = await this.computeDescendantsCTE(nodeId);
await redis.setex(`descendants:${nodeId}`, 3600, JSON.stringify(result));
return result;

// Invalidation: Clear affected caches
async onEdgeChange(parentId: string, childId: string) {
  const ancestorKeys = await this.getAncestorKeys(parentId);
  await redis.del(...ancestorKeys); // Clear upstream caches
}
```

**Benefits:**

- ✅ **Fast reads:** 5-50ms (cache hit rate 80-90%)
- ✅ **Fast writes:** No materialization overhead
- ✅ **Small storage:** 10-50 MB cache vs 143 MB full table
- ✅ **Simple:** TTL handles stale data automatically
- ✅ **Scalable:** Works well to 1M+ nodes

**Drawbacks:**

- Cache cold starts (first query still slow)
- Need Redis infrastructure
- Eventual consistency (acceptable for most UIs)

---

## 🎯 Decision Matrix

| Criteria | CTE + Pagination | Full Materialization | Hybrid Cache |
|----------|-----------------|---------------------|--------------|
| **Read Speed** | 50-200ms ✅ | <50ms ⭐ | 5-200ms ✅ |
| **Write Speed** | <10ms ⭐ | 2-30s ❌ | <10ms ⭐ |
| **Storage** | 22 MB ⭐ | 143 MB ⚠️ | 40 MB ✅ |
| **Complexity** | Low ⭐ | High ❌ | Medium ✅ |
| **Consistency** | Always ⭐ | Risky ⚠️ | Eventual ✅ |
| **Scaling (1M)** | OK ✅ | OK ✅ | Great ⭐ |
| **Best For** | Balanced workload | Read-heavy 95%+ | Most use cases |

---

## 🚀 Final Recommendation

### For Your Project (Concepedia Taxonomy Explorer)

**Implement Option D: CTE + Pagination + Redis Cache**

**Reasoning:**

1. **Requirements:** Interactive UI needs <1s response (cache provides this)
2. **Workload:** Likely 90% reads, 10% writes (cache hit rate solves read performance)
3. **Scale target:** 1M nodes (hybrid scales well, full materialization has risks)
4. **Development time:** 3-4 hours vs 1 day for full materialization
5. **Maintenance:** Simple cache invalidation vs complex path recomputation

**Implementation Plan:**

1. ✅ Keep current CTE implementation (already works)
2. ✅ Add pagination to descendants endpoint (limit=100 default)
3. ✅ Integrate Redis caching layer (Docker already has Redis)
4. ✅ Implement cache invalidation on edge changes
5. ✅ Add depth limits (maxDepth=5 default)

**Expected Performance:**

- Cached queries: <50ms (90% of requests)
- Cache miss: 200ms with pagination (acceptable)
- Cold start (root): 500ms with depth limit (vs 26s currently)
- Writes: <10ms (no overhead)

**Storage:**

- Redis cache: 20-50 MB (vs 143 MB materialized paths)
- Total overhead: Minimal

---

## 📝 Benchmarks to Collect

After implementing Option D, measure:

1. **Cache hit rate:** Should be >85%
2. **p50 latency:** Target <100ms
3. **p95 latency:** Target <500ms
4. **p99 latency:** Target <2s
5. **Write impact:** Should stay <20ms
6. **Memory usage:** Redis should stay <100MB

Document these in your final PDF report with charts showing before/after improvement.
