import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateConceptDto {
  @ApiPropertyOptional({
    description: 'Updated label/name of the concept',
    example: 'Updated Concept',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Updated definition or description',
    example: 'This is an updated definition',
  })
  @IsOptional()
  @IsString()
  definition?: string;

  @ApiPropertyOptional({
    description: 'Updated array of variant labels',
    example: ['variant1', 'variant2'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variants?: string[];
}
