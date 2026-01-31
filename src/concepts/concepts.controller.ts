import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Sse,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { SearchService } from 'src/search/search.service';
import { ConceptsService } from './concepts.service';
import {
  ConceptResponseDto,
  ConceptStatsResponseDto,
  CreateConceptDto,
  PathsToRootResponseDto,
  SearchConceptRequestDto,
  SearchConceptResponseDto,
  UpdateConceptDto,
} from './dto';
import { TaxonomyPathStreamService } from './services/taxonomy-path-stream.service';

@ApiTags('concepts')
@Controller('api/concepts')
export class ConceptsController {
  constructor(
    private readonly conceptsService: ConceptsService,
    private readonly searchService: SearchService,
    private readonly pathStreamService: TaxonomyPathStreamService,
  ) {}

  @Get('admin/stats')
  @ApiOperation({
    summary: 'Get taxonomy statistics (Total nodes, depth, edges)',
  })
  @ApiResponse({ type: ConceptStatsResponseDto })
  async getStats(): Promise<ConceptStatsResponseDto> {
    const stats = await this.conceptsService.getStats();
    return {
      totalNodes: stats.totalNodes,
      totalEdges: stats.totalEdges,
      maxDepth: typeof stats.maxDepth === 'number' ? stats.maxDepth : 0,
      memoryFootprint: stats.memoryFootprint,
    };
  }

  // concept.controller.ts

  @Get('search/fulltext')
  @ApiOperation({ summary: 'Full-text search with cursor-based pagination' })
  @ApiResponse({ type: SearchConceptResponseDto })
  async search(
    @Query(new ValidationPipe({ transform: true }))
    dto: SearchConceptRequestDto,
  ): Promise<SearchConceptResponseDto> {
    return this.searchService.search(
      dto.q,
      dto.pageSize,
      dto.cursor,
      dto.direction,
      {
        level: dto.level,
        fields: dto.fields,
        sort: dto.sort,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get concept details + Definition' })
  @ApiResponse({ type: ConceptResponseDto })
  async findOne(@Param('id') id: string): Promise<ConceptResponseDto> {
    const concept = await this.conceptsService.findOne(id);
    return this.mapToResponse(concept);
  }

  @Get(':id/children')
  @ApiOperation({
    summary: 'Get immediate children (Drill-down navigation)',
    description:
      'Paginated list of children using cursors. Same behavior as home search.',
  })
  async getChildren(
    @Param('id') id: string,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('cursor') cursor?: string,
    @Query('direction', new DefaultValuePipe('next'))
    direction?: 'next' | 'prev',
    @Query('q') q?: string,
  ) {
    const result = await this.conceptsService.getChildren(
      id,
      pageSize,
      cursor,
      direction as any,
      q,
    );
    return {
      parentId: id,
      pageSize: result.pageSize,
      total: result.total,
      took: result.took,
      nextCursor: result.nextCursor,
      prevCursor: result.prevCursor,
      hasNext: result.hasNext,
      hasPrev: result.hasPrev,
      concepts: result.concepts.map((n) => this.mapToResponse(n as any)),
    };
  }

  @Get(':id/parents')
  @ApiOperation({
    summary: 'Get immediate parents (Pagination & Fuzzy Search)',
    description:
      'Paginated list of parents using cursors. Same behavior as home search.',
  })
  async getParents(
    @Param('id') id: string,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('cursor') cursor?: string,
    @Query('direction', new DefaultValuePipe('next'))
    direction?: 'next' | 'prev',
    @Query('q') q?: string,
  ) {
    const result = await this.conceptsService.getParents(
      id,
      pageSize,
      cursor,
      direction as any,
      q,
    );
    return {
      childId: id,
      pageSize: result.pageSize,
      total: result.total,
      took: result.took,
      nextCursor: result.nextCursor,
      prevCursor: result.prevCursor,
      hasNext: result.hasNext,
      hasPrev: result.hasPrev,
      concepts: result.concepts.map((n) => this.mapToResponse(n as any)),
    };
  }

  @Sse(':id/paths/stream')
  @ApiOperation({
    summary: 'Stream all paths to root (SSE)',
    description:
      'Real-time streaming of paths using SSE. Optimized for large DAGs.',
  })
  @ApiQuery({ name: 'maxDepth', required: false, type: Number })
  @ApiQuery({ name: 'maxPaths', required: false, type: Number })
  streamPaths(
    @Param('id') id: string,
    @Query('maxDepth', new ParseIntPipe({ optional: true }))
    maxDepth?: number,
    @Query('maxPaths', new ParseIntPipe({ optional: true }))
    maxPaths?: number,
  ): Observable<MessageEvent> {
    return this.pathStreamService
      .streamPathsToRoot(id, {
        maxDepth,
        maxPaths,
      })
      .pipe(
        map(
          (chunk) =>
            ({
              type: chunk.type,
              data: chunk,
            }) as MessageEvent,
        ),
      );
  }

  @Get(':id/paths')
  @ApiOperation({
    summary: 'Get all paths to root (Breadcrumbs)',
    description:
      'Req: A "paths to root" viewer for multi-parent nodes (DAG support)',
  })
  @ApiResponse({ type: PathsToRootResponseDto })
  async getPathsToRoot(
    @Param('id') id: string,
  ): Promise<PathsToRootResponseDto> {
    const paths = await this.conceptsService.getPathsToRoot(id);
    return {
      paths: paths.map((path) => path.map((n) => this.mapToResponse(n))),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new concept' })
  @ApiResponse({ type: ConceptResponseDto })
  async create(
    @Body(new ValidationPipe({ whitelist: true })) dto: CreateConceptDto,
  ): Promise<ConceptResponseDto> {
    const concept = await this.conceptsService.create(dto);
    return this.mapToResponse(concept);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a concept' })
  @ApiResponse({ type: ConceptResponseDto })
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: UpdateConceptDto,
  ): Promise<ConceptResponseDto> {
    const concept = await this.conceptsService.update(id, dto);
    return this.mapToResponse(concept);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a concept' })
  async remove(@Param('id') id: string) {
    await this.conceptsService.remove(id);
  }

  private mapToResponse(data: any): ConceptResponseDto {
    return {
      id: data.id,
      label: data.label,
      definition: data.definition,
      level: data.level,
      variants: data.variants || [],
      createdAt: data.createdAt || data.created_at,
      updatedAt: data.updatedAt || data.updated_at,
    };
  }
}
