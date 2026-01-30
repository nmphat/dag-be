import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ConceptResponseDto } from '../../concepts/dto/response.dto';
import { GraphEdgeDto } from './graph-common.dto';

// ============================================
// REQUEST DTO
// ============================================

export enum NeighborsDirection {
  PARENTS = 'parents',
  CHILDREN = 'children',
  BOTH = 'both',
}

export class NeighborsQueryDto {
  @ApiPropertyOptional({
    description: 'Direction of neighbors to fetch',
    enum: NeighborsDirection,
    default: NeighborsDirection.BOTH,
  })
  @IsOptional()
  @IsEnum(NeighborsDirection)
  direction?: NeighborsDirection = NeighborsDirection.BOTH;

  @ApiPropertyOptional({
    description: 'Max neighbors per direction',
    default: 50,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number = 0;
}

// ============================================
// RESPONSE DTO
// ============================================

export class NeighborsPaginationDto {
  @ApiProperty({ description: 'Whether there are more parents' })
  hasMoreParents: boolean;

  @ApiProperty({ description: 'Whether there are more children' })
  hasMoreChildren: boolean;

  @ApiProperty({ description: 'Total count of parents', example: 2 })
  totalParents: number;

  @ApiProperty({ description: 'Total count of children', example: 150 })
  totalChildren: number;

  @ApiProperty({ description: 'Current offset for parents', example: 0 })
  parentsOffset: number;

  @ApiProperty({ description: 'Current offset for children', example: 0 })
  childrenOffset: number;
}

export class NeighborsResponseDto {
  @ApiProperty({ description: 'The node ID', example: 'n_123' })
  nodeId: string;

  @ApiProperty({ description: 'Parent nodes', type: [ConceptResponseDto] })
  parents: ConceptResponseDto[];

  @ApiProperty({ description: 'Child nodes', type: [ConceptResponseDto] })
  children: ConceptResponseDto[];

  @ApiProperty({ description: 'Edges to parents', type: [GraphEdgeDto] })
  parentEdges: GraphEdgeDto[];

  @ApiProperty({
    description: 'Edges from this node to children',
    type: [GraphEdgeDto],
  })
  childEdges: GraphEdgeDto[];

  @ApiProperty({ description: 'Pagination info', type: NeighborsPaginationDto })
  pagination: NeighborsPaginationDto;
}
