import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryConceptsDto {
  @ApiPropertyOptional({
    description: 'Search term to filter concepts by label or definition',
    example: 'concept',
  })
  @IsOptional()
  @IsString()
  search?: string;

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
    description: 'Maximum number of concepts to return',
    example: 50,
    minimum: 1,
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 50;

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
