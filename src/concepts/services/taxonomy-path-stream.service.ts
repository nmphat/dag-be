import { Injectable, NotFoundException } from '@nestjs/common';
import { Selectable } from 'kysely';
import { Observable, Subject } from 'rxjs';
import { DatabaseService } from 'src/db/database.service';
import { DB } from 'src/db/types';
import {
  DomainConcept,
  PathChunk,
  StreamOptions,
} from '../types/taxonomy.types';
import { TaxonomyCacheService } from './taxonomy-cache.service';

@Injectable()
export class TaxonomyPathStreamService {
  private readonly DEFAULT_MAX_DEPTH = 25;
  private readonly DEFAULT_MAX_PATHS = 1000;
  private readonly PROGRESS_INTERVAL = 50;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cache: TaxonomyCacheService,
  ) {}

  // ============================================
  // MAIN STREAMING
  // ============================================

  streamPathsToRoot(
    conceptId: string,
    options: StreamOptions = {},
  ): Observable<PathChunk> {
    const subject = new Subject<PathChunk>();

    this.executeStream(conceptId, options, subject)
      .catch((err) => {
        subject.next({ type: 'error', error: err.message });
      })
      .finally(() => {
        subject.complete();
      });

    return subject.asObservable();
  }

  private async executeStream(
    conceptId: string,
    options: StreamOptions,
    subject: Subject<PathChunk>,
  ): Promise<void> {
    const maxDepth = options.maxDepth ?? this.DEFAULT_MAX_DEPTH;
    const maxPaths = options.maxPaths ?? this.DEFAULT_MAX_PATHS;
    const CONCURRENCY = options.concurrency ?? 10;

    const startConcept = await this.getConceptCached(conceptId);
    if (!startConcept) {
      throw new NotFoundException(`Concept ${conceptId} not found`);
    }

    let pathsFound = 0;
    let nodesProcessed = 0;

    // Initialize Stack (Iterative DFS)
    // We use a LIFO approach (processing from the end) to mimic DFS.
    // This ensures we reach roots quickly without expanding the entire width of the graph first (BFS).
    const queue: { nodeId: string; currentPath: string[]; depth: number }[] = [
      { nodeId: conceptId, currentPath: [conceptId], depth: 0 },
    ];

    while (queue.length > 0 && pathsFound < maxPaths) {
      // Process a batch from the END (Stack / LIFO)
      // This is crucial for performance when finding paths to deep roots.
      const batchStartIndex = Math.max(0, queue.length - CONCURRENCY);
      const batch = queue.splice(batchStartIndex, CONCURRENCY);

      const results = await Promise.all(
        batch.map(async ({ nodeId, currentPath, depth }) => {
          // Check limits again inside (for fast exit)
          if (pathsFound >= maxPaths) return [];

          nodesProcessed++;
          if (nodesProcessed % this.PROGRESS_INTERVAL === 0) {
            subject.next({
              type: 'progress',
              progress: { found: pathsFound, processed: nodesProcessed },
            });
          }

          // Depth limit
          if (depth >= maxDepth) {
            const resolvedPath = await this.resolvePathIds(currentPath);
            subject.next({ type: 'path', path: resolvedPath });
            pathsFound++;
            return [];
          }

          // Get parents
          const parents = await this.getParentsCached(nodeId);

          // Root reached
          if (parents.length === 0) {
            const resolvedPath = await this.resolvePathIds(currentPath);
            subject.next({ type: 'path', path: resolvedPath });
            pathsFound++;
            return [];
          }

          // Prepare next items
          const nextItems: typeof queue = [];
          for (const parentId of parents) {
            // Cycle check
            if (currentPath.includes(parentId)) {
              // We should probably log this only occasionally to avoid spam
              // console.warn(`Cycle: ${parentId} in path`);
              continue;
            }
            nextItems.push({
              nodeId: parentId,
              currentPath: [...currentPath, parentId],
              depth: depth + 1,
            });
          }
          return nextItems;
        }),
      );

      // Add new items to queue
      // Flatten results
      for (const newItems of results) {
        if (pathsFound >= maxPaths) break;
        queue.push(...newItems);
      }
    }

    subject.next({
      type: 'done',
      progress: { found: pathsFound, processed: nodesProcessed },
    });
  }

  // ============================================
  // CACHED DATA ACCESS (Kysely queries)
  // ============================================

  private async getParentsCached(nodeId: string): Promise<string[]> {
    // Cache first
    const cached = await this.cache.getParents(nodeId);
    if (cached !== null) return cached;

    // Query with Kysely
    const rows = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('edges')
        .select('parent_id')
        .where('child_id', '=', nodeId)
        .execute(),
    );

    const parentIds = rows.map((r) => r.parent_id);
    await this.cache.setParents(nodeId, parentIds);
    return parentIds;
  }

  private async getConceptCached(id: string): Promise<DomainConcept | null> {
    const cached = await this.cache.getConcept(id);
    if (cached) return cached;

    const row = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst(),
    );

    if (!row) return null;

    const concept = this.mapToDomain(row);
    await this.cache.setConcept(concept);
    return concept;
  }

  private async resolvePathIds(ids: string[]): Promise<DomainConcept[]> {
    // Check cache
    const cachedMap = await this.cache.getConceptsBatch(ids);
    const missingIds = ids.filter((id) => !cachedMap.has(id));

    // Batch load missing
    if (missingIds.length > 0) {
      const rows = await this.databaseService.db.executeRead((trx) =>
        trx
          .selectFrom('concepts')
          .selectAll()
          .where('id', 'in', missingIds)
          .execute(),
      );

      const newConcepts = rows.map((r) => this.mapToDomain(r));
      await this.cache.setConceptsBatch(newConcepts);
      newConcepts.forEach((c) => cachedMap.set(c.id, c));
    }

    // Reverse: root → target
    return ids
      .slice()
      .reverse()
      .map((id) => cachedMap.get(id))
      .filter((c): c is DomainConcept => c !== undefined);
  }

  private mapToDomain(row: Selectable<DB['concepts']>): DomainConcept {
    const r = row as any;
    return {
      id: r.id,
      label: r.label,
      definition: r.definition,
      level: r.level,
      createdAt: r.createdAt || r.created_at,
      updatedAt: r.updatedAt || r.updated_at,
    };
  }

  // ============================================
  // INVALIDATION
  // ============================================

  async onEdgeChanged(childId: string): Promise<void> {
    const toInvalidate: string[] = [childId];
    const visited = new Set<string>([childId]);
    const queue = [childId];
    const MAX_INVALIDATE = 10_000;

    while (queue.length > 0 && toInvalidate.length < MAX_INVALIDATE) {
      const current = queue.shift()!;

      const children = await this.databaseService.db.executeRead((trx) =>
        trx
          .selectFrom('edges')
          .select('child_id')
          .where('parent_id', '=', current)
          .execute(),
      );

      for (const { child_id } of children) {
        if (!visited.has(child_id)) {
          visited.add(child_id);
          toInvalidate.push(child_id);
          queue.push(child_id);
        }
      }
    }

    await this.cache.invalidateSubtree(toInvalidate);
  }
}
