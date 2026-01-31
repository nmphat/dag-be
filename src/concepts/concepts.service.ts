import { Injectable, NotFoundException } from '@nestjs/common';
import { ConceptRepository, EdgeRepository } from 'src/database/repositories';
import { DomainConcept } from 'src/database/repositories/domain.types';
import { VariantRepository } from 'src/database/repositories/variants.repository';
import { SearchService } from 'src/search/search.service';
import { CreateConceptDto, QueryConceptsDto, UpdateConceptDto } from './dto';

@Injectable()
export class ConceptsService {
  constructor(
    private readonly conceptRepo: ConceptRepository,
    private readonly variantRepo: VariantRepository,
    private readonly edgeRepo: EdgeRepository,
    private readonly searchService: SearchService,
  ) {}

  // ==========================================
  // 1. SCALING & OBSERVABILITY Support
  // ==========================================

  async generateHugeDataset(count: number) {
    return {
      status: 'Skipped',
      message: 'Please run the dedicated seed script for performance.',
      command: 'npx prisma db seed',
      note: `Generating ${count} nodes via HTTP is not recommended.`,
    };
  }

  async getStats() {
    const [totalNodes, totalEdges, maxDepth] = await Promise.all([
      this.conceptRepo.count({}),
      this.edgeRepo.countEdges(), // Used from EdgeRepository
      this.conceptRepo.getMaxDepth(),
    ]);

    return {
      totalNodes,
      totalEdges,
      maxDepth: maxDepth || 'Unknown',
      memoryFootprint: 'Check container stats',
    };
  }

  // ==========================================
  // 2. EXPLORATION & NAVIGATION (Graph/DAG)
  // ==========================================

  async getChildren(
    parentId: string,
    pageSize = 20,
    cursor?: string,
    direction: 'next' | 'prev' = 'next',
    q?: string,
  ) {
    // Standardize on SearchService for cursor-based navigation
    return this.searchService.searchRelations(
      'children',
      parentId,
      q,
      pageSize,
      cursor,
      direction,
    );
  }

  async getParents(
    childId: string,
    pageSize = 20,
    cursor?: string,
    direction: 'next' | 'prev' = 'next',
    q?: string,
  ) {
    const parents = await this.edgeRepo.getParents(childId);
    const parentIds = parents.map((p) => p.id);

    return this.searchService.searchRelations(
      'parents',
      childId,
      q,
      pageSize,
      cursor,
      direction,
      parentIds,
    );
  }

  async getPathsToRoot(id: string): Promise<DomainConcept[][]> {
    const exists = await this.conceptRepo.findById(id);
    if (!exists) throw new NotFoundException(`Concept ${id} not found`);
    return this.conceptRepo.getPathsToRoot(id);
  }

  async getDescendants(id: string): Promise<DomainConcept[]> {
    const exists = await this.conceptRepo.findById(id);
    if (!exists) throw new NotFoundException(`Concept ${id} not found`);
    return this.conceptRepo.getDescendants(id);
  }

  async getAncestors(id: string): Promise<DomainConcept[]> {
    const exists = await this.conceptRepo.findById(id);
    if (!exists) throw new NotFoundException(`Concept ${id} not found`);
    return this.conceptRepo.getAncestors(id);
  }

  // ==========================================
  // 3. CRUD OPERATIONS
  // ==========================================

  async create(
    dto: CreateConceptDto,
  ): Promise<DomainConcept & { variants: string[] }> {
    // 1. Create Concept
    const concept = await this.conceptRepo.create({
      id: dto.id,
      label: dto.label,
      definition: dto.definition,
      level: dto.level ?? 0,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 2. Create Variants (Using VariantRepository)
    if (dto.variants?.length) {
      await Promise.all(
        dto.variants.map((name) =>
          this.variantRepo.create({
            concept_id: concept.id,
            name,
            created_at: new Date(),
          }),
        ),
      );
    }

    // 3. Sync to Elastic
    const variants = dto.variants ?? [];
    await this.searchService.indexConcept({
      id: concept.id,
      label: concept.label,
      definition: concept.definition ?? undefined,
      level: concept.level,
      variants,
      parent_ids: [], // New concepts start with no parents
    });

    return { ...concept, variants };
  }

  async findOne(
    id: string,
  ): Promise<DomainConcept & { variants: string[]; parents: DomainConcept[] }> {
    const concept = await this.conceptRepo.findById(id);
    if (!concept) {
      throw new NotFoundException(`Concept with id ${id} not found`);
    }

    const [variants, parents] = await Promise.all([
      this.variantRepo.findByConceptId(id), // From VariantRepo
      this.edgeRepo.getParents(id), // From EdgeRepo
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
  ): Promise<DomainConcept & { variants: string[] }> {
    const existing = await this.conceptRepo.findById(id);
    if (!existing) throw new NotFoundException(`Concept ${id} not found`);

    const { variants, ...conceptData } = dto;

    // Update Concept
    const concept = await this.conceptRepo.update(id, conceptData);

    // Update Variants
    if (variants) {
      await this.variantRepo.deleteByConceptId(id); // Clean old variants
      await Promise.all(
        variants.map((name) =>
          this.variantRepo.create({
            concept_id: id,
            name,
            created_at: new Date(),
          }),
        ),
      );
    }

    // Fetch updated variants for response & indexing
    const updatedVariants = variants
      ? variants
      : (await this.variantRepo.findByConceptId(id)).map((v) => v.name);

    // Sync to Elastic
    const parentIds = (await this.edgeRepo.getParents(id)).map((p) => p.id);
    await this.searchService.indexConcept({
      id: concept.id,
      label: concept.label,
      definition: concept.definition ?? undefined,
      level: concept.level,
      variants: updatedVariants,
      parent_ids: parentIds,
    });

    return { ...concept, variants: updatedVariants };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.conceptRepo.findById(id);
    if (!existing) throw new NotFoundException(`Concept ${id} not found`);

    // Cascade delete is handled by DB FKs usually, but we call delete on root
    await this.conceptRepo.delete(id);
    await this.searchService.deleteConcept(id);
  }

  async query(
    dto: QueryConceptsDto,
  ): Promise<{ nodes: DomainConcept[]; total: number }> {
    const where: any = {};

    if (dto.level !== undefined) {
      where.level = dto.level;
    }

    if (dto.search) {
      where.label = dto.search; // Repo handles partial match logic
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

  // Helper for re-indexing a concept (e.g. after edge changes)
  async syncConceptToSearch(id: string) {
    const concept = await this.conceptRepo.findById(id);
    if (!concept) return;

    const [variants, parents] = await Promise.all([
      this.variantRepo.findByConceptId(id),
      this.edgeRepo.getParents(id),
    ]);

    await this.searchService.indexConcept({
      id: concept.id,
      label: concept.label,
      definition: concept.definition ?? undefined,
      level: concept.level,
      variants: variants.map((v) => v.name),
      parent_ids: parents.map((p) => p.id),
    });
  }
}
