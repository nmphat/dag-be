import { Injectable } from '@nestjs/common';
import { Insertable, Selectable, Updateable, sql } from 'kysely';
import { DatabaseService } from 'src/db/database.service';
import { DB } from 'src/db/types';
import { DomainConcept } from './domain.types';

// -- Database Types --
type ConceptTable = DB['concepts'];
type NewConcept = Insertable<ConceptTable>;
type ConceptUpdate = Updateable<ConceptTable>;

@Injectable()
export class ConceptRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  // ============================================
  // BASIC CRUD (Master)
  // ============================================

  async create(data: NewConcept): Promise<DomainConcept> {
    await this.databaseService.db
      .write()
      .insertInto('concepts')
      .values(data)
      .execute();

    return {
      id: data.id as string,
      label: data.label,
      definition: data.definition || null,
      level: data.level || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async findById(id: string): Promise<DomainConcept | null> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst(),
    );
    return res ? this.mapToDomainConcept(res) : null;
  }

  async findMany(params: {
    where?: { label?: string; definition?: string; level?: number };
    take?: number;
    skip?: number;
  }): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) => {
      let query = trx.selectFrom('concepts').selectAll();

      if (params.where?.level !== undefined) {
        query = query.where('level', '=', params.where.level);
      }

      // Implement Search Filter
      if (params.where?.label) {
        query = query.where((eb) =>
          eb.or([
            eb('label', 'like', `%${params.where?.label}%`),
            eb('definition', 'like', `%${params.where?.label}%`),
          ]),
        );
      }

      return query
        .orderBy('level', 'asc')
        .orderBy('label', 'asc')
        .limit(params.take || 20)
        .offset(params.skip || 0)
        .execute();
    });

    return res.map(this.mapToDomainConcept);
  }

  async count(where?: { level?: number; label?: string }): Promise<number> {
    return this.databaseService.db.executeRead(async (trx) => {
      let query = trx
        .selectFrom('concepts')
        .select(trx.fn.count('id').as('count'));

      if (where?.level !== undefined) {
        query = query.where('level', '=', where.level);
      }

      if (where?.label) {
        query = query.where((eb) =>
          eb.or([
            eb('label', 'like', `%${where.label}%`),
            eb('definition', 'like', `%${where.label}%`),
          ]),
        );
      }

      const res = await query.executeTakeFirst();
      return Number(res?.count || 0);
    });
  }

  async update(id: string, data: ConceptUpdate): Promise<DomainConcept> {
    await this.databaseService.db
      .write()
      .updateTable('concepts')
      .set({ ...data, updated_at: new Date() })
      .where('id', '=', id)
      .execute();

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Concept ${id} not found after update`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.databaseService.db
      .write()
      .deleteFrom('concepts')
      .where('id', '=', id)
      .execute();
  }

  // ============================================
  // NAVIGATION & DRILL-DOWN
  // ============================================

  async findChildren(
    parentId: string,
    limit: number,
    offset: number,
  ): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .innerJoin('edges', 'edges.child_id', 'concepts.id')
        .selectAll('concepts')
        .where('edges.parent_id', '=', parentId)
        .orderBy('concepts.level', 'asc')
        .orderBy('concepts.label', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
    );
    return res.map(this.mapToDomainConcept);
  }

  async countChildren(parentId: string): Promise<number> {
    return this.databaseService.db.executeRead(async (trx) => {
      const res = await trx
        .selectFrom('edges')
        .where('parent_id', '=', parentId)
        .select(trx.fn.count('child_id').as('count'))
        .executeTakeFirst();
      return Number(res?.count || 0);
    });
  }

  async findParents(childId: string): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .innerJoin('edges', 'edges.parent_id', 'concepts.id')
        .selectAll('concepts')
        .where('edges.child_id', '=', childId)
        .execute(),
    );
    return res.map(this.mapToDomainConcept);
  }

  // ============================================
  // OBSERVABILITY & STATS
  // ============================================

  async getMaxDepth(): Promise<number> {
    return this.databaseService.db.executeRead(async (trx) => {
      const res = await trx
        .selectFrom('concepts')
        .select(trx.fn.max('level').as('max_level'))
        .executeTakeFirst();
      return Number(res?.max_level || 0);
    });
  }

  // ============================================
  // GRAPH ALGORITHMS (Recursive CTEs)
  // ============================================

  async getAncestors(conceptId: string): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .withRecursive('ancestors', (qb) =>
          qb
            .selectFrom('edges')
            .select(['parent_id', 'child_id'])
            .where('child_id', '=', conceptId)
            .unionAll((qb) =>
              qb
                .selectFrom('edges as e')
                .innerJoin('ancestors as a', 'e.child_id', 'a.parent_id')
                .select(['e.parent_id', 'e.child_id']),
            ),
        )
        .selectFrom('ancestors as a')
        .innerJoin('concepts as c', 'a.parent_id', 'c.id')
        .selectAll('c')
        .distinct()
        .orderBy('c.level', 'asc')
        .execute(),
    );
    return res.map(this.mapToDomainConcept);
  }

  async getDescendants(conceptId: string): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .withRecursive('descendants', (qb) =>
          qb
            .selectFrom('edges')
            .select(['parent_id', 'child_id'])
            .where('parent_id', '=', conceptId)
            .unionAll((qb) =>
              qb
                .selectFrom('edges as e')
                .innerJoin('descendants as d', 'e.parent_id', 'd.child_id')
                .select(['e.parent_id', 'e.child_id']),
            ),
        )
        .selectFrom('descendants as d')
        .innerJoin('concepts as c', 'd.child_id', 'c.id')
        .selectAll('c')
        .distinct()
        .execute(),
    );
    return res.map(this.mapToDomainConcept);
  }

  async getPathsToRoot(conceptId: string): Promise<DomainConcept[][]> {
    // 1. Recursive CTE
    const pathResults = await this.databaseService.db.executeRead((trx) =>
      trx
        .withRecursive('path_cte', (db) =>
          db
            .selectFrom('edges')
            .select([
              'parent_id',
              'child_id',
              sql<string>`CAST(parent_id AS CHAR(1000))`.as('path_str'),
            ])
            .where('child_id', '=', conceptId)
            .unionAll((db) =>
              db
                .selectFrom('edges as e')
                .innerJoin('path_cte as cte', 'e.child_id', 'cte.parent_id')
                .select([
                  'e.parent_id',
                  'e.child_id',
                  sql<string>`CONCAT(e.parent_id, ',', cte.path_str)`.as(
                    'path_str',
                  ),
                ]),
            ),
        )
        .selectFrom('path_cte')
        .select('path_str')
        .execute(),
    );

    if (pathResults.length === 0) return [];

    // 2. Extract IDs
    const allPathIds = new Set<string>();
    pathResults.forEach((row) => {
      const pathStr = (row as any).pathStr || (row as any).path_str;
      if (pathStr)
        pathStr.split(',').forEach((id: string) => allPathIds.add(id));
    });
    allPathIds.add(conceptId);

    // 3. Fetch Concepts
    const conceptsMapRes = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .selectAll()
        .where('id', 'in', Array.from(allPathIds))
        .execute(),
    );

    const conceptMap = new Map(
      conceptsMapRes.map((c) => [c.id, this.mapToDomainConcept(c)]),
    );
    const targetNode = conceptMap.get(conceptId);

    if (!targetNode) return [];

    // 4. Reconstruct Paths
    return pathResults.map((row) => {
      const pathStr = (row as any).pathStr || (row as any).path_str;
      const ids = pathStr.split(',');
      const pathObjects = ids
        .map((id: string) => conceptMap.get(id))
        .filter((c: DomainConcept | undefined): c is DomainConcept => !!c);
      return [...pathObjects, targetNode];
    });
  }

  // --- MAPPERS ---
  private mapToDomainConcept(row: Selectable<ConceptTable>): DomainConcept {
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
}
