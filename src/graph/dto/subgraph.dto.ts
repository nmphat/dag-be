import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ConceptResponseDto } from '../../concepts/dto/response.dto';
import { GraphEdgeDto } from './graph-common.dto';

// ============================================
// REQUEST DTO
// ============================================

export enum SubgraphDirection {
  UP = 'up',
  DOWN = 'down',
  BOTH = 'both',
}

export class SubgraphQueryDto {
  @ApiPropertyOptional({
    description: 'Depth to expand from center node',
    default: 2,
    minimum: 1,
    maximum: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4) // Hard limit for 1M scale
  @Transform(({ value }) => parseInt(value, 10))
  depth?: number = 2;

  @ApiPropertyOptional({
    description: 'Direction to traverse',
    enum: SubgraphDirection,
    default: SubgraphDirection.BOTH,
  })
  @IsOptional()
  @IsEnum(SubgraphDirection)
  direction?: SubgraphDirection = SubgraphDirection.BOTH;

  @ApiPropertyOptional({
    description: 'Maximum nodes to return',
    default: 200,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => parseInt(value, 10))
  maxNodes?: number = 200;

  @ApiPropertyOptional({
    description: 'Include full node data or just IDs',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeDetails?: boolean = true;
}

// ============================================
// RESPONSE DTO
// ============================================

export class SubgraphMetadataDto {
  @ApiProperty({ description: 'Total nodes in subgraph', example: 150 })
  totalNodes: number;

  @ApiProperty({ description: 'Total edges in subgraph', example: 200 })
  totalEdges: number;

  @ApiProperty({ description: 'Actual depth traversed', example: 2 })
  depth: number;

  @ApiProperty({
    description: 'Whether results were truncated due to maxNodes limit',
  })
  truncated: boolean;

  @ApiProperty({
    description: 'Number of nodes cut off if truncated',
    example: 50,
  })
  truncatedNodes: number;
}

export class SubgraphResponseDto {
  @ApiProperty({ description: 'The center node', type: ConceptResponseDto })
  centerNode: ConceptResponseDto;

  @ApiProperty({
    description: 'All nodes in subgraph',
    type: [ConceptResponseDto],
  })
  nodes: ConceptResponseDto[];

  @ApiProperty({ description: 'All edges in subgraph', type: [GraphEdgeDto] })
  edges: GraphEdgeDto[];

  @ApiProperty({ description: 'Subgraph metadata', type: SubgraphMetadataDto })
  metadata: SubgraphMetadataDto;
}
