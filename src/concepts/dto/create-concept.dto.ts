import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateConceptDto {
  @ApiProperty({
    description: 'Unique identifier for the concept',
    example: 'concept-1',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Label/name of the concept',
    example: 'Root Concept',
  })
  @IsString()
  label: string;

  @ApiPropertyOptional({
    description: 'Detailed definition or description',
    example: 'This is the root concept in our graph',
  })
  @IsOptional()
  @IsString()
  definition?: string = '';

  @ApiPropertyOptional({
    description: 'Hierarchy level of the concept',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  level?: number = 0;

  @ApiPropertyOptional({
    description: 'Array of variant labels',
    default: [],
    example: ['root', 'base'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variants?: string[];
}
