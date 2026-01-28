import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SearchService } from '../search/search.service';
import { ConceptsService } from './concepts.service';
import { CreateConceptDto, UpdateConceptDto } from './dto';

@ApiTags('concepts')
@Controller('api/concepts')
export class ConceptsController {
  constructor(
    private readonly conceptsService: ConceptsService,
    private readonly searchService: SearchService,
  ) {}

  @Get('admin/stats')
  @ApiOperation({
    summary: 'Get taxonomy statistics (Total nodes, depth, edges)',
  })
  async getStats() {
    return this.conceptsService.getStats();
  }

  @Get('search/fulltext')
  @ApiOperation({ summary: 'Full-text search with highlighting' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Prefix search supported',
  })
  @ApiQuery({
    name: 'groupByLabel',
    required: false,
    type: Boolean,
    description: 'Bonus Goal: Group identical labels',
  })
  async search(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('groupByLabel', new DefaultValuePipe(false), ParseBoolPipe)
    groupByLabel: boolean,
  ) {
    // If groupByLabel is true, Service logic will handle grouping by label
    // and return distinct IDs within that group for "Disambiguation context"
    return this.searchService.search(query, limit, offset);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get concept details + Definition' })
  async findOne(@Param('id') id: string) {
    return this.conceptsService.findOne(id);
  }

  @Get(':id/children')
  @ApiOperation({
    summary: 'Get immediate children (Drill-down navigation)',
    description:
      'Paginated list of children. Critical for nodes with thousands of sub-concepts.',
  })
  async getChildren(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    // Replaces generic "getDescendants" for UI tree navigation
    const children = await this.conceptsService.getChildren(id, limit, offset);
    return {
      parentId: id,
      pagination: { limit, offset },
      data: children,
    };
  }

  @Get(':id/paths')
  @ApiOperation({
    summary: 'Get all paths to root (Breadcrumbs)',
    description:
      'Req: A "paths to root" viewer for multi-parent nodes (DAG support)',
  })
  async getPathsToRoot(@Param('id') id: string) {
    // Returns array of arrays: [['Science', 'Biology', 'Cell'], ['Chemistry', 'Cell']]
    return this.conceptsService.getPathsToRoot(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new concept' })
  async create(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateConceptDto,
  ) {
    return this.conceptsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a concept' })
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateConceptDto,
  ) {
    return this.conceptsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a concept' })
  async remove(@Param('id') id: string) {
    await this.conceptsService.remove(id);
  }
}
