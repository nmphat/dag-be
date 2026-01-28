import { Injectable, NotFoundException } from '@nestjs/common';
import type { Concept } from '@prisma/client';
import { ConceptRepository } from '../database/repositories';
import { SearchService } from '../search/search.service';
import { CreateConceptDto, QueryConceptsDto, UpdateConceptDto } from './dto';

@Injectable()
export class ConceptsService {
  constructor(
    private readonly conceptRepo: ConceptRepository,
    private readonly searchService: SearchService,
  ) {}

  // ==========================================
  // 1. SCALING & OBSERVABILITY Support
  // ==========================================

  async generateHugeDataset(count: number) {
    // We intentionally do NOT implement this inside the API Service to avoid timeout/memory leaks.
    // The Controller calls this, but we return instructions.
    return {
      status: 'Skipped',
      message: 'Please run the dedicated seed script for performance.',
      command: 'npx prisma db seed',
      note: `Generating ${count} nodes via HTTP is not recommended.`,
    };
  }

  async getStats() {
    // Simple observability metrics
    const [totalNodes, totalEdges, maxDepth] = await Promise.all([
      this.conceptRepo.count({}),
      this.conceptRepo.countEdges(), // Assumes repo has this
      this.conceptRepo.getMaxDepth(), // Assumes repo has this or return estimate
    ]);

    return {
      totalNodes,
      totalEdges,
      maxDepth: maxDepth || 'Unknown', // Expensive to calc exactly on huge datasets
      memoryFootprint: 'Check container stats', // Placeholder
    };
  }

  // ==========================================
  // 2. EXPLORATION & NAVIGATION (Graph/DAG)
  // ==========================================

  /**
   * Drill-down navigation: Get immediate children with pagination.
   * Optimized for large lists (10k children).
   */
  async getChildren(parentId: string, limit: number, offset: number) {
    const [children, total] = await Promise.all([
      this.conceptRepo.findChildren(parentId, limit, offset),
      this.conceptRepo.countChildren(parentId),
    ]);

    return {
      nodes: children,
      total,
    };
  }

  /**
   * DAG Support: Returns ALL paths from current node to root.
   * Example: [['Biology', 'Science'], ['Life Science', 'Science']]
   */
  async getPathsToRoot(id: string): Promise<Concept[][]> {
    // Ensure node exists
    const exists = await this.conceptRepo.findById(id);
    if (!exists) throw new NotFoundException(`Concept ${id} not found`);

    // Delegate recursive query to Repository (using Kysely CTE)
    return this.conceptRepo.getPathsToRoot(id);
  }

  // ==========================================
  // 3. CRUD OPERATIONS
  // ==========================================

  async create(
    dto: CreateConceptDto,
  ): Promise<Concept & { variants: string[] }> {
    const concept = await this.conceptRepo.create({
      id: dto.id,
      label: dto.label,
      definition: dto.definition,
      level: dto.level ?? 0,
    });

    if (dto.variants?.length) {
      await Promise.all(
        dto.variants.map((name) =>
          this.conceptRepo.createVariant(concept.id, name),
        ),
      );
    }

    // Sync to Elastic
    const variants = dto.variants ?? [];
    await this.searchService.indexConcept({
      id: concept.id,
      label: concept.label,
      definition: concept.definition ?? undefined,
      level: concept.level,
      variants,
    });

    return { ...concept, variants };
  }

  async findOne(
    id: string,
  ): Promise<Concept & { variants: string[]; parents: Concept[] }> {
    const concept = await this.conceptRepo.findById(id);
    if (!concept) {
      throw new NotFoundException(`Concept with id ${id} not found`);
    }

    const [variants, parents] = await Promise.all([
      this.conceptRepo.findVariantsByConceptId(id),
      this.conceptRepo.findParents(id), // Fetch immediate parents for DAG context
    ]);

    return {
      ...concept,
      variants: variants.map((v) => v.name),
      parents,
    };
  }

  async update(
    id: string,
    dto: UpdateConceptDto,
  ): Promise<Concept & { variants: string[] }> {
    // Check existence first
    const existing = await this.conceptRepo.findById(id);
    if (!existing) throw new NotFoundException(`Concept ${id} not found`);

    const { variants, ...conceptData } = dto;

    // Transaction-like update (could be wrapped in $transaction if critical)
    const concept = await this.conceptRepo.update(id, conceptData);

    if (variants) {
      await this.conceptRepo.deleteVariantsByConceptId(id);
      await Promise.all(
        variants.map((name) => this.conceptRepo.createVariant(id, name)),
      );
    }

    // Re-fetch updated variants
    const updatedVariants = variants
      ? variants
      : (await this.conceptRepo.findVariantsByConceptId(id)).map((v) => v.name);

    // Sync to Elastic
    await this.searchService.indexConcept({
      id: concept.id,
      label: concept.label,
      definition: concept.definition ?? undefined,
      level: concept.level,
      variants: updatedVariants,
    });

    return { ...concept, variants: updatedVariants };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.conceptRepo.findById(id);
    if (!existing) throw new NotFoundException(`Concept ${id} not found`);

    await this.conceptRepo.delete(id);
    await this.searchService.deleteConcept(id);
  }

  async query(
    dto: QueryConceptsDto,
  ): Promise<{ nodes: Concept[]; total: number }> {
    const where: any = {};
    if (dto.level !== undefined) {
      where.level = dto.level;
    }
    // Only apply basic DB search if ES is not used for this query
    // (Ideally, 'search' should route to Elastic, but this is DB fallback)
    if (dto.search) {
      where.OR = [
        { label: { contains: dto.search } },
        { definition: { contains: dto.search } },
      ];
    }

    const [nodes, total] = await Promise.all([
      this.conceptRepo.findMany({
        where,
        take: dto.limit,
        skip: dto.offset,
      }),
      this.conceptRepo.count(where),
    ]);

    return { nodes, total };
  }
}
