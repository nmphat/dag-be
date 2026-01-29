import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export enum SearchField {
  LABEL = 'label',
  DEF = 'definition',
  VARIANTS = 'variants',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

// Template Literal Type for auto-building sort string
export type SortParam = `${SearchField | 'level' | '_score'}:${SortOrder}`;

// Custom Validator for SortParam
export function IsSortParam(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isSortParam',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const [field, order] = value.split(':');
          const validFields = [
            ...Object.values(SearchField),
            'level',
            '_score',
          ];
          const validOrders = Object.values(SortOrder);
          return (
            validFields.includes(field as any) &&
            validOrders.includes(order as any)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be in format "field:order" (e.g. level:desc). Supported fields: label, definition, variants, level, _score.`;
        },
      },
    });
  };
}

// dto/search-concept.dto.ts

import { IsIn, Max } from 'class-validator';

export class SearchConceptRequestDto {
  @ApiPropertyOptional({
    description: 'Search term to filter concepts by label or definition',
    example: undefined,
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter concepts by hierarchy level',
    example: undefined,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  level?: number;

  @ApiPropertyOptional({
    description:
      'Fields to include in the search. Defaults to label,variants,definition.',
    enum: SearchField,
    isArray: true,
    example: [SearchField.LABEL, SearchField.VARIANTS],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(SearchField, { each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',');
    }
    return value;
  })
  fields?: SearchField[];

  @ApiPropertyOptional({
    description:
      'Sort params in format "field:order". Supported fields: label, definition, variants, level, _score. Order: asc, desc. \nPattern: ^(label|definition|variants|level|_score):(asc|desc)$',
    example: ['_score:desc'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsSortParam({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',');
    }
    return value;
  })
  sort?: SortParam[];

  @ApiPropertyOptional({
    description: 'Number of concepts to return per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number = 20;

  @ApiPropertyOptional({
    description:
      'Pagination cursor from previous response (nextCursor or prevCursor)',
    example: undefined,
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'Pagination direction: "next" for forward, "prev" for backward',
    enum: ['next', 'prev'],
    default: 'next',
  })
  @IsOptional()
  @IsIn(['next', 'prev'])
  direction?: 'next' | 'prev' = 'next';
}

export class SearchConceptResponseDto {
  @ApiProperty({ description: 'List of matching concepts' })
  concepts: any[];

  @ApiProperty({ description: 'Total number of matches found' })
  total: number;

  @ApiProperty({ description: 'Time took to execute search in ms' })
  took: number;

  @ApiProperty({ description: 'Number of concepts per page' })
  pageSize: number;

  @ApiPropertyOptional({
    description:
      'Cursor for next page. Pass this as "cursor" with direction="next"',
  })
  nextCursor?: string;

  @ApiPropertyOptional({
    description:
      'Cursor for previous page. Pass this as "cursor" with direction="prev"',
  })
  prevCursor?: string;

  @ApiProperty({
    description: 'Whether there are more results after this page',
  })
  hasNext: boolean;

  @ApiProperty({ description: 'Whether there are results before this page' })
  hasPrev: boolean;
}
