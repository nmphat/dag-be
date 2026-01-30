import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConceptRepository, EdgeRepository } from '../database/repositories';
import { CreateEdgeDto } from './dto';
import { DomainConcept } from 'src/database/repositories/domain.types';

@Injectable()
export class EdgesService {
  constructor(
    private readonly edgeRepo: EdgeRepository,
    private readonly conceptRepo: ConceptRepository,
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
  }

  async remove(parentId: string, childId: string): Promise<void> {
    try {
      await this.edgeRepo.delete(parentId, childId);
    } catch {
      throw new NotFoundException(`Edge not found`);
    }
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
