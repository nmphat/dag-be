import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConceptResponseDto {
  @ApiProperty({ example: 'n_12345' })
  id: string;

  @ApiProperty({ example: 'Artificial Intelligence' })
  label: string;

  @ApiPropertyOptional({ example: 'The simulation of human intelligence...' })
  definition?: string;

  @ApiProperty({ example: 4 })
  level: number;

  @ApiProperty({ example: ['AI', 'Machine Intelligence'] })
  variants: string[];

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  updatedAt: Date;
}

export class ConceptStatsResponseDto {
  @ApiProperty({ example: 10000 })
  totalNodes: number;

  @ApiProperty({ example: 45000 })
  totalEdges: number;

  @ApiProperty({ example: 10 })
  maxDepth: number;

  @ApiProperty({ example: 'Check container stats' })
  memoryFootprint: string;
}

export class ConceptPaginationDto {
  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 0 })
  offset: number;

  @ApiProperty({ example: 100 })
  total: number;
}

export class ConceptChildrenResponseDto {
  @ApiProperty({ example: 'n_12345' })
  parentId: string;

  @ApiProperty({ type: ConceptPaginationDto })
  pagination: ConceptPaginationDto;

  @ApiProperty({ type: [ConceptResponseDto] })
  data: ConceptResponseDto[];
}

export class PathsToRootResponseDto {
  // Array of paths, where each path is an array of Concepts
  @ApiProperty({
    type: 'array',
    items: {
      type: 'array',
      items: { $ref: '#/components/schemas/ConceptResponseDto' },
    },
    example: [
      [
        { id: 'n_1', label: 'Root' },
        { id: 'n_2', label: 'Child' },
      ],
    ],
  })
  paths: ConceptResponseDto[][];
}
