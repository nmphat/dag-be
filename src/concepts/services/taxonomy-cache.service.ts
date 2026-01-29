import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DomainConcept } from '../types/taxonomy.types';

@Injectable()
export class TaxonomyCacheService {
  private readonly PARENTS_PREFIX = 'taxonomy:parents:';
  private readonly CONCEPT_PREFIX = 'taxonomy:concept:';
  private readonly PARENTS_TTL = 60 * 15;
  private readonly CONCEPT_TTL = 60 * 30;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  // Parents cache
  async getParents(nodeId: string): Promise<string[] | null> {
    const cached = await this.redis.get(this.PARENTS_PREFIX + nodeId);
    return cached ? JSON.parse(cached) : null;
  }

  async setParents(nodeId: string, parentIds: string[]): Promise<void> {
    await this.redis.setex(
      this.PARENTS_PREFIX + nodeId,
      this.PARENTS_TTL,
      JSON.stringify(parentIds),
    );
  }

  // Concept cache
  async getConcept(id: string): Promise<DomainConcept | null> {
    const cached = await this.redis.get(this.CONCEPT_PREFIX + id);
    return cached ? JSON.parse(cached) : null;
  }

  async setConcept(concept: DomainConcept): Promise<void> {
    await this.redis.setex(
      this.CONCEPT_PREFIX + concept.id,
      this.CONCEPT_TTL,
      JSON.stringify(concept),
    );
  }

  async getConceptsBatch(ids: string[]): Promise<Map<string, DomainConcept>> {
    if (ids.length === 0) return new Map();

    const keys = ids.map((id) => this.CONCEPT_PREFIX + id);
    const values = await this.redis.mget(...keys);

    const result = new Map<string, DomainConcept>();
    values.forEach((val, idx) => {
      if (val) result.set(ids[idx], JSON.parse(val));
    });
    return result;
  }

  async setConceptsBatch(concepts: DomainConcept[]): Promise<void> {
    if (concepts.length === 0) return;

    const pipeline = this.redis.pipeline();
    concepts.forEach((c) => {
      pipeline.setex(
        this.CONCEPT_PREFIX + c.id,
        this.CONCEPT_TTL,
        JSON.stringify(c),
      );
    });
    await pipeline.exec();
  }

  // Invalidation
  async invalidateSubtree(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    const keys = nodeIds.map((id) => this.PARENTS_PREFIX + id);
    await this.redis.del(...keys);
  }
}
