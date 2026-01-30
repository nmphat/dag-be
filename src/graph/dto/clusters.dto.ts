import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ConceptResponseDto } from '../../concepts/dto/response.dto';
import { GraphEdgeDto } from './graph-common.dto';

// ============================================
// REQUEST DTO
// ============================================

export class ClusterQueryDto {
  @ApiPropertyOptional({
    description: 'Level to cluster at (0 = root level)',
    default: 1,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  @Transform(({ value }) => parseInt(value, 10))
  level?: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum clusters to return',
    default: 50,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;
}

// ============================================
// RESPONSE DTO
// ============================================

export class ClusterNodeDto {
  @ApiProperty({
    description: 'Cluster representative node',
    type: ConceptResponseDto,
  })
  node: ConceptResponseDto;

  @ApiProperty({
    description: 'Count of all descendants under this node (recursive)',
    example: 1500,
  })
  descendantCount: number;

  @ApiProperty({
    description: 'Count of direct children',
    example: 45,
  })
  directChildCount: number;

  @ApiProperty({
    description: 'Whether this node has no children (leaf in DAG)',
  })
  isLeaf: boolean;
}

export class ClustersStatsDto {
  @ApiProperty({ description: 'Level that was queried', example: 1 })
  level: number;

  @ApiProperty({ description: 'Total clusters at this level', example: 50 })
  totalClusters: number;

  @ApiProperty({ description: 'Total nodes in entire graph', example: 1000000 })
  totalNodesInGraph: number;

  @ApiProperty({
    description: 'Average descendants per cluster',
    example: 20000,
  })
  avgDescendantsPerCluster: number;
}

export class ClustersResponseDto {
  @ApiProperty({
    description: 'Cluster nodes at requested level',
    type: [ClusterNodeDto],
  })
  clusters: ClusterNodeDto[];

  @ApiProperty({
    description: 'Edges between clusters (at this level)',
    type: [GraphEdgeDto],
  })
  edges: GraphEdgeDto[];

  @ApiProperty({ description: 'Summary statistics', type: ClustersStatsDto })
  stats: ClustersStatsDto;
}
