import { ApiProperty } from '@nestjs/swagger';
import { ConceptResponseDto } from '../../concepts/dto/response.dto';

/**
 * Common DTO for graph edge representation
 */
export class GraphEdgeDto {
  @ApiProperty({ description: 'Source node ID (parent)', example: 'n_123' })
  source: string;

  @ApiProperty({ description: 'Target node ID (child)', example: 'n_456' })
  target: string;
}

/**
 * Convert domain concept to response DTO with variants placeholder
 */
export function toConceptResponse(
  concept: {
    id: string;
    label: string;
    definition?: string | null;
    level: number;
    createdAt?: Date;
    updatedAt?: Date;
  },
  variants: string[] = [],
): ConceptResponseDto {
  return {
    id: concept.id,
    label: concept.label,
    definition: concept.definition ?? undefined,
    level: concept.level,
    variants,
    createdAt: concept.createdAt ?? new Date(),
    updatedAt: concept.updatedAt ?? new Date(),
  };
}
