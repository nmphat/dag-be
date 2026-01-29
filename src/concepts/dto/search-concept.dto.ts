import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SearchConceptRequestDto {
  @ApiProperty({
    description: 'Search term to filter concepts by label or definition',
    example: 'concept',
  })
  @IsString()
  q: string;

  @ApiPropertyOptional({
    description: 'Filter concepts by hierarchy level',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  level?: number;

  @ApiPropertyOptional({
    description:
      'Fields to include in the search. Defaults to label,variants,definition. Supports comma-separated values in query string.',
    example: ['label', 'variants', 'definition'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',');
    }
    return value;
  })
  fields?: string[];

  @ApiPropertyOptional({
    description:
      'Sort params in format "field:order". E.g. ["level:desc", "createdAt:asc"]',
    example: ['level:desc'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',');
    }
    return value;
  })
  sort?: string[];

  @ApiPropertyOptional({
    description: 'Maximum number of concepts to return',
    example: 50,
    minimum: 1,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of concepts to skip for pagination',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

export class SearchConceptResponseDto {
  @ApiProperty({ description: 'List of matching concepts' })
  concepts: any[]; // We can refine this type or import DomainConcept/ConceptDocument if we move types to shared location

  @ApiProperty({ description: 'Total number of matches found' })
  total: number;

  @ApiProperty({ description: 'Time took to execute search in ms' })
  took: number;
}
