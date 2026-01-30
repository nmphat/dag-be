import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ConceptResponseDto } from '../../concepts/dto/response.dto';
import { GraphEdgeDto } from './graph-common.dto';

// ============================================
// REQUEST DTO
// ============================================

export enum PathDirection {
  ANY = 'any',
  UPWARD = 'upward', // child -> parent direction
  DOWNWARD = 'downward', // parent -> child direction
}

export class ShortestPathQueryDto {
  @ApiProperty({ description: 'Source node ID', example: 'n_123' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ description: 'Target node ID', example: 'n_456' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiPropertyOptional({
    description: 'Direction constraint for path finding',
    enum: PathDirection,
    default: PathDirection.ANY,
  })
  @IsOptional()
  @IsEnum(PathDirection)
  direction?: PathDirection = PathDirection.ANY;

  @ApiPropertyOptional({
    description: 'Maximum path length to search',
    default: 10,
    maximum: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Transform(({ value }) => parseInt(value, 10))
  maxLength?: number = 10;
}

// ============================================
// RESPONSE DTO
// ============================================

export class ShortestPathResponseDto {
  @ApiProperty({ description: 'Whether a path was found' })
  found: boolean;

  @ApiPropertyOptional({
    description: 'Ordered path from source to target',
    type: [ConceptResponseDto],
    nullable: true,
  })
  path: ConceptResponseDto[] | null;

  @ApiPropertyOptional({
    description: 'Edges along the path',
    type: [GraphEdgeDto],
    nullable: true,
  })
  edges: GraphEdgeDto[] | null;

  @ApiProperty({ description: 'Path length (number of hops)', example: 3 })
  length: number;

  @ApiProperty({ description: 'Time taken in milliseconds', example: 15 })
  took: number;
}
