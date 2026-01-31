// search.service.ts

import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from '@nestjs/elasticsearch';

export interface ConceptDocument {
  id: string;
  label: string;
  definition?: string;
  level: number;
  variants?: string[];
  parent_ids?: string[]; // Direct parent IDs for relation-based filtering
  _score?: number;
  _highlight?: Record<string, string[]>;
}

export interface SearchResult {
  concepts: ConceptDocument[];
  total: number;
  took: number;
  pageSize: number;
  // Cursor-based pagination
  nextCursor?: string;
  prevCursor?: string;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SearchOptions {
  level?: number;
  fields?: string[];
  sort?: string[];
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly indexName: string;
  private readonly MAX_PAGE_SIZE = 100;
  private readonly DEFAULT_FIELDS = ['label^3', 'definition', 'variants^2'];

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly configService: ConfigService,
  ) {
    this.indexName = this.configService.get<string>(
      'ES_INDEX_NAME',
      'concepts',
    );
  }

  async onModuleInit() {
    await this.createIndex();
  }

  /**
   * Initializes the 'concepts' index with custom analyzers.
   */
  private async createIndex() {
    try {
      const exists = await this.elasticsearchService.indices.exists({
        index: this.indexName,
      });

      if (exists) {
        this.logger.log(
          `✅ Elasticsearch index already exists: ${this.indexName}`,
        );
        return;
      }

      await this.elasticsearchService.indices.create({
        index: this.indexName,
        settings: {
          number_of_shards: parseInt(process.env.ES_NUMBER_OF_SHARDS || '1'),
          number_of_replicas: parseInt(
            process.env.ES_NUMBER_OF_REPLICAS || '0',
          ),
          analysis: {
            analyzer: {
              custom_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding'],
              },
            },
          },
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            label: {
              type: 'text',
              analyzer: 'custom_analyzer',
              fields: { keyword: { type: 'keyword' } },
            },
            definition: {
              type: 'text',
              analyzer: 'custom_analyzer',
              fields: { keyword: { type: 'keyword', ignore_above: 256 } },
            },
            level: { type: 'integer' },
            variants: {
              type: 'text',
              analyzer: 'custom_analyzer',
              fields: { keyword: { type: 'keyword' } },
            },
            parent_ids: { type: 'keyword' },
          },
        },
      });

      this.logger.log(`✅ Created Elasticsearch index: ${this.indexName}`);
    } catch (error) {
      this.logger.error(`❌ Failed to create index ${this.indexName}:`, error);
    }
  }

  /**
   * Index a single concept.
   */
  async indexConcept(concept: ConceptDocument): Promise<void> {
    await this.elasticsearchService.index({
      index: this.indexName,
      id: concept.id,
      document: concept,
    });
  }

  /**
   * Bulk index concepts.
   */
  async indexConcepts(concepts: ConceptDocument[]): Promise<void> {
    if (concepts.length === 0) return;

    const operations = concepts.flatMap((concept) => [
      { index: { _index: this.indexName, _id: concept.id } },
      concept,
    ]);

    const result = await this.elasticsearchService.bulk({
      operations,
      refresh: false,
    });

    if (result.errors) {
      const erroredItems = result.items.filter((item) => item.index?.error);
      this.logger.error(
        `⚠️ Failed to index ${erroredItems.length} concepts`,
        erroredItems,
      );
    } else {
      this.logger.log(
        `✅ Indexed ${concepts.length} concepts to Elasticsearch`,
      );
    }
  }

  async deleteConcept(id: string): Promise<void> {
    try {
      await this.elasticsearchService.delete({
        index: this.indexName,
        id,
      });
    } catch (error: any) {
      if (error?.meta?.statusCode !== 404) {
        throw error;
      }
    }
  }

  /**
   * Search with cursor-based pagination (next/prev navigation).
   * Supports unlimited deep pagination using search_after.
   */
  async search(
    query?: string,
    pageSize = 20,
    cursor?: string,
    direction: 'next' | 'prev' = 'next',
    options?: SearchOptions,
  ): Promise<SearchResult> {
    // Validate page size
    pageSize = Math.min(Math.max(1, pageSize), this.MAX_PAGE_SIZE);

    // Build query
    const esQuery = this.buildQuery(query, options);
    const sort = this.buildSort(options?.sort, !!query);

    // Decode cursor if provided
    const searchAfter = cursor ? this.decodeCursor(cursor) : undefined;

    // For prev direction: reverse sort order
    const effectiveSort = direction === 'prev' ? this.reverseSort(sort) : sort;

    // Fetch one extra to determine hasMore
    const response = await this.elasticsearchService.search({
      index: this.indexName,
      size: pageSize + 1,
      query: esQuery,
      sort: effectiveSort,
      ...(searchAfter && { search_after: searchAfter }),
      track_total_hits: true,
      track_scores: true,
      ...(query && {
        highlight: {
          fields: {
            label: {},
            definition: {},
            variants: {},
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
      }),
    });

    let hits = response.hits.hits;
    const totalHits = response.hits.total as SearchTotalHits;
    const total = typeof totalHits === 'number' ? totalHits : totalHits.value;

    // Check if there are more results
    const hasMore = hits.length > pageSize;
    if (hasMore) {
      hits = hits.slice(0, pageSize);
    }

    // For prev direction: reverse results back to correct order
    if (direction === 'prev') {
      hits = hits.reverse();
    }

    // Build cursors from first and last hits
    const firstHit = hits[0];
    const lastHit = hits[hits.length - 1];

    // Next cursor: from last hit (for forward pagination)
    const nextCursor = lastHit?.sort
      ? this.encodeCursor(lastHit.sort)
      : undefined;

    // Prev cursor: from first hit (for backward pagination)
    const prevCursor = firstHit?.sort
      ? this.encodeCursor(firstHit.sort)
      : undefined;

    return {
      concepts: hits.map((hit) => {
        const source = hit._source as ConceptDocument;
        return {
          ...source,
          _score: hit._score || 0,
          _highlight: hit.highlight as Record<string, string[]>,
        };
      }),
      total,
      took: response.took || 0,
      pageSize,
      nextCursor: hasMore || direction === 'prev' ? nextCursor : undefined,
      prevCursor: cursor ? prevCursor : undefined, // No prev on first page
      hasNext: direction === 'next' ? hasMore : true,
      hasPrev: !!cursor,
    };
  }

  /**
   * Search within direct relations (children or parents).
   */
  async searchRelations(
    type: 'children' | 'parents',
    nodeId: string,
    query?: string,
    limit = 20,
    offset = 0,
    parentIds?: string[], // Used for 'parents' type search
  ): Promise<{ concepts: ConceptDocument[]; total: number; took: number }> {
    const must: any[] = [];

    if (type === 'children') {
      // Find all where parent_ids contains nodeId
      must.push({ term: { parent_ids: nodeId } });
    } else {
      // Find all with specific IDs
      if (!parentIds || parentIds.length === 0) {
        return { concepts: [], total: 0, took: 0 };
      }
      must.push({ ids: { values: parentIds } });
    }

    if (query) {
      must.push({
        bool: {
          should: [
            {
              multi_match: {
                query,
                fields: ['label^3', 'variants^2'],
                type: 'bool_prefix',
                boost: 10,
              },
            },
            {
              multi_match: {
                query,
                fields: ['label^3', 'variants^2'],
                fuzziness: 'AUTO',
                boost: 1,
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    const start = performance.now();
    const response = await this.elasticsearchService.search({
      index: this.indexName,
      from: offset,
      size: limit,
      query: { bool: { must } },
      track_total_hits: true,
    });
    const took = Math.round(performance.now() - start);

    const totalHits = response.hits.total as SearchTotalHits;
    const total = typeof totalHits === 'number' ? totalHits : totalHits.value;

    return {
      concepts: response.hits.hits.map((hit) => ({
        ...(hit._source as ConceptDocument),
        _score: hit._score || 0,
      })),
      total,
      took,
    };
  }

  // ============================================
  // QUERY BUILDERS
  // ============================================

  private buildQuery(query?: string, options?: SearchOptions): any {
    const searchFields =
      options?.fields && options.fields.length > 0
        ? options.fields
        : this.DEFAULT_FIELDS;

    const must: any[] = [];
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: searchFields,
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    const filter: any[] = [];
    if (options?.level !== undefined) {
      filter.push({ term: { level: options.level } });
    }

    return { bool: { must, filter } };
  }

  private buildSort(sortOptions?: string[], hasQuery?: boolean): any[] {
    const sort: any[] = [];

    if (sortOptions && sortOptions.length > 0) {
      sortOptions.forEach((s) => {
        const [field, order] = s.split(':');
        if (field) {
          const sortField =
            field === 'label' || field === 'definition' || field === 'variants'
              ? `${field}.keyword`
              : field;
          sort.push({
            [sortField]: { order: order === 'asc' ? 'asc' : 'desc' },
          });
        }
      });
    } else if (hasQuery) {
      // Default: sort by relevance score
      sort.push({ _score: 'desc' });
    } else {
      // No query: sort by label
      sort.push({ 'label.keyword': 'asc' });
    }

    // Always add unique tiebreaker (required for search_after)
    sort.push({ id: 'asc' });

    return sort;
  }

  private reverseSort(sort: any[]): any[] {
    return sort.map((s) => {
      const key = Object.keys(s)[0];
      const value = s[key];

      if (typeof value === 'string') {
        return { [key]: value === 'asc' ? 'desc' : 'asc' };
      }

      return {
        [key]: {
          ...value,
          order: value.order === 'asc' ? 'desc' : 'asc',
        },
      };
    });
  }

  // ============================================
  // CURSOR ENCODING/DECODING
  // ============================================

  private encodeCursor(sortValues: any[]): string {
    return Buffer.from(JSON.stringify(sortValues)).toString('base64url');
  }

  private decodeCursor(cursor: string): any[] {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }

  async clearIndex(): Promise<void> {
    try {
      await this.elasticsearchService.indices.delete({
        index: this.indexName,
        ignore_unavailable: true,
      });
      await this.createIndex();
      this.logger.log(`✅ Cleared Elasticsearch index: ${this.indexName}`);
    } catch (error) {
      this.logger.error('Failed to clear Elasticsearch index:', error);
      throw error;
    }
  }
}
