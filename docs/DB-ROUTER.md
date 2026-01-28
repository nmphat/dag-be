# DbRouter Pattern - Master-Slave Replication

## Architecture

```
┌─────────────┐
│  DbRouter   │
├─────────────┤
│ write() →   │──────────────→ Master (3306)
│             │
│ read()  →   │──┬───────────→ Slave1 (3307)
│             │  └───────────→ Slave2 (3308)
│             │     Round-robin load balancing
│ readSafe()  │──────────────→ Slaves (fallback to Master)
└─────────────┘
```

## Usage

### Simple CRUD (Prisma ORM)

```typescript
// Write operations → Master
await this.prisma.prisma.node.create({ data: {...} })
await this.prisma.prisma.node.update({ where: {...}, data: {...} })

// Read operations → Slaves (automatic via Prisma extension)
await this.prisma.prisma.node.findMany()
await this.prisma.prisma.node.findUnique({ where: {...} })
```

### Complex Queries (Kysely + DbRouter)

```typescript
// Read from slaves (round-robin)
const ancestors = await this.prisma.db
  .read()
  .withRecursive('ancestors', ...)
  .execute()

// Write to master
await this.prisma.db
  .write()
  .insertInto('nodes')
  .values({...})
  .execute()

// Safe read (fallback to master if slaves fail)
const db = await this.prisma.db.readSafe()
const result = await db.selectFrom('nodes').execute()
```

## Benefits

1. **Automatic Load Balancing**: Round-robin across 2 slaves
2. **High Availability**: Automatic fallback to master if slaves fail
3. **Separation of Concerns**:
   - Prisma: Simple CRUD with type safety
   - Kysely: Complex queries (CTEs, raw SQL)
4. **Shared Connection Pools**: No connection overhead
5. **Type Safe**: Full TypeScript support

## Performance

- **Writes**: Always go to Master (consistency)
- **Reads**: Distributed across 2 slaves (2x throughput)
- **Fallback**: Automatic failover if slave is down
- **Connection Reuse**: Pools shared between Prisma & Kysely

## Example: Ancestors Query

```typescript
// Repository method
async getAncestors(nodeId: string): Promise<Node[]> {
  const result = await this.prisma.db
    .read() // ← Automatically selects slave (round-robin)
    .withRecursive('ancestors', (qb) =>
      qb
        .selectFrom('edges')
        .select(['parent_id', 'child_id'])
        .where('child_id', '=', nodeId)
        .unionAll((qb) =>
          qb
            .selectFrom('edges as e')
            .innerJoin('ancestors as a', 'e.child_id', 'a.parent_id')
            .select(['e.parent_id', 'e.child_id']),
        ),
    )
    .selectFrom('ancestors as a')
    .innerJoin('nodes as n', 'a.parent_id', 'n.id')
    .selectAll('n')
    .execute();

  return result.map(r => ({
    ...r,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })) as Node[];
}
```

## Load Balancing Strategy

**Round-Robin (Current)**:

- Request 1 → Slave1
- Request 2 → Slave2
- Request 3 → Slave1
- Request 4 → Slave2
- ...

**Alternative: Random** (commented in DbRouter):

```typescript
const pool = this.readPools[Math.floor(Math.random() * this.readPools.length)]
```

Round-robin ensures even distribution, Random provides better isolation.

## Monitoring

Check connection status:

```bash
curl http://localhost:3000/health/db
```

Expected response:

```json
{
  "status": "ok",
  "database": {
    "connected": true,
    "nodeCount": 0
  }
}
```
