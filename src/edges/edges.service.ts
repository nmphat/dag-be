import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DomainConcept } from 'src/database/repositories/domain.types';
import { ConceptRepository, EdgeRepository } from '../database/repositories';
import { VariantRepository } from '../database/repositories/variants.repository';
import { SearchService } from '../search/search.service';
import { CreateEdgeDto } from './dto';

@Injectable()
export class EdgesService {
  constructor(
    private readonly edgeRepo: EdgeRepository,
    private readonly conceptRepo: ConceptRepository,
    private readonly variantRepo: VariantRepository,
    private readonly searchService: SearchService,
  ) {}

  async create(dto: CreateEdgeDto): Promise<void> {
    // Check if nodes exist
    const [parent, child] = await Promise.all([
      this.conceptRepo.findById(dto.parentId),
      this.conceptRepo.findById(dto.childId),
    ]);

    if (!parent) {
      throw new NotFoundException(`Parent node ${dto.parentId} not found`);
    }
    if (!child) {
      throw new NotFoundException(`Child node ${dto.childId} not found`);
    }

    // Check for cycle
    const hasCycle = await this.detectCycle(dto.parentId, dto.childId);
    if (hasCycle) {
      throw new BadRequestException(
        `Creating edge from ${dto.parentId} to ${dto.childId} would create a cycle`,
      );
    }

    // Create edge
    await this.edgeRepo.create(dto.parentId, dto.childId);

    // Sync child to search index
    await this.syncConceptToSearch(dto.childId);
  }

  async remove(parentId: string, childId: string): Promise<void> {
    try {
      await this.edgeRepo.delete(parentId, childId);
      // Sync child to search index
      await this.syncConceptToSearch(childId);
    } catch {
      throw new NotFoundException(`Edge not found`);
    }
  }

  // Helper for re-indexing a concept (direct repo usage to avoid circular dependency)
  private async syncConceptToSearch(id: string) {
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

  async getParents(nodeId: string): Promise<DomainConcept[]> {
    return this.edgeRepo.getParents(nodeId);
  }

  async getChildren(nodeId: string): Promise<DomainConcept[]> {
    return this.edgeRepo.getChildren(nodeId);
  }

  private async detectCycle(
    parentId: string,
    childId: string,
  ): Promise<boolean> {
    // Check if childId can reach parentId (would create a cycle)
    return this.edgeRepo.canReach(childId, parentId);
  }
}
