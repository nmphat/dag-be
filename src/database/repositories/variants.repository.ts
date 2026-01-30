import { Injectable } from '@nestjs/common';
import { Insertable, Selectable, Updateable } from 'kysely';
import { DatabaseService } from 'src/db/database.service';
import { DB } from 'src/db/types';
import { DomainVariant } from './domain.types';

// -- Database Types --
type VariantTable = DB['variants'];
type NewVariant = Insertable<VariantTable>;
type VariantUpdate = Updateable<VariantTable>;

@Injectable()
export class VariantRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: NewVariant): Promise<DomainVariant> {
    const result = await this.databaseService.db
      .write()
      .insertInto('variants')
      .values(data)
      .executeTakeFirst();

    // MySQL returns insertId as BigInt
    const id = Number(result.insertId);

    return {
      id,
      conceptId: data.concept_id,
      name: data.name,
      createdAt: new Date(),
    };
  }

  async findById(id: number): Promise<DomainVariant | null> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('variants')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst(),
    );
    return res ? this.mapToDomainVariant(res) : null;
  }

  async findByConceptId(conceptId: string): Promise<DomainVariant[]> {
    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('variants')
        .selectAll()
        .where('concept_id', '=', conceptId)
        .execute(),
    );
    return res.map(this.mapToDomainVariant);
  }

  async findByConceptIds(conceptIds: string[]): Promise<DomainVariant[]> {
    if (conceptIds.length === 0) return [];

    const res = await this.databaseService.db.executeRead((trx) =>
      trx
        .selectFrom('variants')
        .selectAll()
        .where('concept_id', 'in', conceptIds)
        .execute(),
    );
    return res.map(this.mapToDomainVariant);
  }

  async update(id: number, name: string): Promise<DomainVariant> {
    await this.databaseService.db
      .write()
      .updateTable('variants')
      .set({ name })
      .where('id', '=', id)
      .execute();

    const updated = await this.findById(id);
    if (!updated) throw new Error(`Variant ${id} not found`);
    return updated;
  }

  async delete(id: number): Promise<void> {
    await this.databaseService.db
      .write()
      .deleteFrom('variants')
      .where('id', '=', id)
      .execute();
  }

  async deleteByConceptId(conceptId: string): Promise<void> {
    await this.databaseService.db
      .write()
      .deleteFrom('variants')
      .where('concept_id', '=', conceptId)
      .execute();
  }

  private mapToDomainVariant(
    row: Selectable<VariantTable> | any,
  ): DomainVariant {
    const r = row as any;
    return {
      id: r.id,
      conceptId: r.conceptId || r.concept_id,
      name: r.name,
      createdAt: r.createdAt || r.created_at,
    };
  }
}
