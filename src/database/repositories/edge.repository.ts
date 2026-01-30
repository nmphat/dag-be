import { Injectable } from '@nestjs/common';
import { Selectable, sql } from 'kysely';
import { DatabaseService } from 'src/db/database.service';
import { DB } from 'src/db/types';
import { DomainConcept, DomainEdge } from './domain.types';

// -- Database Types --
type EdgeTable = DB['edges'];
type ConceptTable = DB['concepts'];

@Injectable()
export class EdgeRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  // ============================================
  // WRITE OPERATIONS
  // ============================================

  async create(parentId: string, childId: string): Promise<DomainEdge> {
    const createdAt = new Date();
    await this.databaseService.db
      .write()
      .insertInto('edges')
      .values({
        parent_id: parentId,
        child_id: childId,
        created_at: createdAt,
      })
      .execute();

    return { parentId, childId, createdAt };
  }

  async delete(parentId: string, childId: string): Promise<void> {
    await this.databaseService.db
      .write()
      .deleteFrom('edges')
      .where('parent_id', '=', parentId)
      .where('child_id', '=', childId)
      .execute();
  }

  // ============================================
  // READ OPERATIONS
  // ============================================

  async findByParentAndChild(
    parentId: string,
    childId: string,
  ): Promise<DomainEdge | null> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('edges')
        .selectAll()
        .where('parent_id', '=', parentId)
        .where('child_id', '=', childId)
        .executeTakeFirst(),
    );
    return res ? this.mapToDomainEdge(res) : null;
  }

  async findByParent(
    parentId: string,
    includeChild = false,
  ): Promise<DomainEdge[]> {
    return this.databaseService.db.executeRead(async (trx) => {
      let query = trx
        .selectFrom('edges')
        .selectAll('edges')
        .where('parent_id', '=', parentId);

      if (includeChild) {
        query = query
          .innerJoin('concepts as c', 'edges.child_id', 'c.id')
          .select([
            'c.id as c_id',
            'c.label as c_label',
            'c.definition as c_definition',
            'c.level as c_level',
            'c.created_at as c_created_at',
            'c.updated_at as c_updated_at',
          ]);
      }

      const res = await query.execute();
      return res.map((row) => {
        const edge = this.mapToDomainEdge(row);
        if (includeChild && (row as any).c_id)
          edge.child = this.mapJoinedConcept(row, 'c_');
        return edge;
      });
    });
  }

  async findByChild(
    childId: string,
    includeParent = false,
  ): Promise<DomainEdge[]> {
    return this.databaseService.db.executeRead(async (trx) => {
      let query = trx
        .selectFrom('edges')
        .selectAll('edges')
        .where('child_id', '=', childId);

      if (includeParent) {
        query = query
          .innerJoin('concepts as p', 'edges.parent_id', 'p.id')
          .select([
            'p.id as p_id',
            'p.label as p_label',
            'p.definition as p_definition',
            'p.level as p_level',
            'p.created_at as p_created_at',
            'p.updated_at as p_updated_at',
          ]);
      }

      const res = await query.execute();
      return res.map((row) => {
        const edge = this.mapToDomainEdge(row);
        if (includeParent && (row as any).p_id)
          edge.parent = this.mapJoinedConcept(row, 'p_');
        return edge;
      });
    });
  }

  // ============================================
  // STATS & HELPERS
  // ============================================

  async countEdges(): Promise<number> {
    return this.databaseService.db.executeRead(async (trx) => {
      const res = await trx
        .selectFrom('edges')
        .select(trx.fn.count('parent_id').as('count'))
        .executeTakeFirst();
      return Number(res?.count || 0);
    });
  }

  async getParents(conceptId: string): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .innerJoin('edges', 'edges.parent_id', 'concepts.id')
        .selectAll('concepts')
        .where('edges.child_id', '=', conceptId)
        .execute(),
    );
    return res.map(this.mapToDomainConcept);
  }

  async getChildren(conceptId: string): Promise<DomainConcept[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .innerJoin('edges', 'edges.child_id', 'concepts.id')
        .selectAll('concepts')
        .where('edges.parent_id', '=', conceptId)
        .execute(),
    );
    return res.map(this.mapToDomainConcept);
  }

  async getParentsOfConcepts(
    conceptIds: string[],
  ): Promise<Array<{ childId: string; parent: DomainConcept }>> {
    if (conceptIds.length === 0) return [];

    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .innerJoin('edges', 'edges.parent_id', 'concepts.id')
        .selectAll('concepts')
        .select('edges.child_id as relation_owner_id')
        .where('edges.child_id', 'in', conceptIds)
        .execute(),
    );

    return res.map((row) => ({
      childId: (row as any).relation_owner_id,
      parent: this.mapToDomainConcept(row),
    }));
  }

  async getChildrenOfConcepts(
    conceptIds: string[],
  ): Promise<Array<{ parentId: string; child: DomainConcept }>> {
    if (conceptIds.length === 0) return [];

    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('concepts')
        .innerJoin('edges', 'edges.child_id', 'concepts.id')
        .selectAll('concepts')
        .select('edges.parent_id as relation_owner_id')
        .where('edges.parent_id', 'in', conceptIds)
        .execute(),
    );

    return res.map((row) => ({
      parentId: (row as any).relation_owner_id,
      child: this.mapToDomainConcept(row),
    }));
  }

  async detectCycle(parentId: string, childId: string): Promise<boolean> {
    return this.canReach(childId, parentId);
  }

  async canReach(fromId: string, toId: string): Promise<boolean> {
    const result = await this.databaseService.db.executeRead((trx) =>
      trx
        .withRecursive('path_cte', (qb) =>
          qb
            .selectFrom('edges')
            .select(['parent_id', 'child_id'])
            .where('parent_id', '=', fromId)
            .unionAll((qb) =>
              qb
                .selectFrom('edges as e')
                .innerJoin('path_cte as p', 'e.parent_id', 'p.child_id')
                .select(['e.parent_id', 'e.child_id']),
            ),
        )
        .selectFrom('path_cte')
        .select(sql<number>`1`.as('exists_flag'))
        .where('child_id', '=', toId)
        .limit(1)
        .execute(),
    );
    return result.length > 0;
  }

  // --- MAPPERS ---
  private mapToDomainEdge(row: Selectable<EdgeTable> | any): DomainEdge {
    const r = row as any;
    return {
      parentId: r.parentId || r.parent_id,
      childId: r.childId || r.child_id,
      createdAt: r.createdAt || r.created_at,
    };
  }

  private mapToDomainConcept(
    row: Selectable<ConceptTable> | any,
  ): DomainConcept {
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

  private mapJoinedConcept(row: any, prefix: string): DomainConcept {
    return {
      id: row[`${prefix}id`],
      label: row[`${prefix}label`],
      definition: row[`${prefix}definition`],
      level: row[`${prefix}level`],
      createdAt: row[`${prefix}created_at`] || row[`${prefix}createdAt`],
      updatedAt: row[`${prefix}updated_at`] || row[`${prefix}updatedAt`],
    };
  }
}
