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

    const startConcept = await this.getConceptCached(conceptId);
    if (!startConcept) {
      throw new NotFoundException(`Concept ${conceptId} not found`);
    }

    let pathsFound = 0;
    let nodesProcessed = 0;

    /**
     * Recursive backtracking DFS
     * @param nodeId - Current node
     * @param currentPath - Path from start concept to current node
     * @param depth - Current depth
     */
    const dfs = async (
      nodeId: string,
      currentPath: string[],
      depth: number,
    ): Promise<void> => {
      // Stop if max paths reached
      if (pathsFound >= maxPaths) return;

      nodesProcessed++;

      // Progress update
      if (nodesProcessed % this.PROGRESS_INTERVAL === 0) {
        subject.next({
          type: 'progress',
          progress: { found: pathsFound, processed: nodesProcessed },
        });
      }

      // Depth limit → emit partial path
      if (depth >= maxDepth) {
        const resolvedPath = await this.resolvePathIds(currentPath);
        subject.next({ type: 'path', path: resolvedPath });
        pathsFound++;
        return;
      }

      // Get parents
      const parents = await this.getParentsCached(nodeId);

      // ROOT (no parents) → emit complete path
      if (parents.length === 0) {
        const resolvedPath = await this.resolvePathIds(currentPath);
        subject.next({ type: 'path', path: resolvedPath });
        pathsFound++;
        return;
      }

      // Recursive: explore each parent
      for (const parentId of parents) {
        if (pathsFound >= maxPaths) return;

        // Cycle detection
        if (currentPath.includes(parentId)) {
          console.warn(`Cycle: ${parentId} in path`);
          continue;
        }

        // Backtracking: add parent → recurse → (auto removed on return)
        await dfs(parentId, [...currentPath, parentId], depth + 1);
      }
    };

    // Start DFS from conceptId
    await dfs(conceptId, [conceptId], 0);

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
