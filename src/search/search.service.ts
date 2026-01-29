import { SearchTotalHits } from '@elastic/elasticsearch/lib/api/types';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

export interface ConceptDocument {
  id: string;
  label: string;
  definition?: string;
  level: number;
  variants?: string[];
  // Metadata for search results
  _score?: number;
  _highlight?: Record<string, string[]>;
}

export interface SearchResult {
  concepts: ConceptDocument[];
  total: number;
  took: number;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly indexName = process.env.ES_INDEX_NAME || 'concepts'; // Renamed to 'concepts'

  constructor(private readonly elasticsearchService: ElasticsearchService) {}

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
              fields: {
                keyword: { type: 'keyword' },
              },
            },
            definition: {
              type: 'text',
              analyzer: 'custom_analyzer',
              fields: {
                keyword: { type: 'keyword', ignore_above: 256 },
              },
            },
            level: { type: 'integer' },
            variants: {
              type: 'text',
              analyzer: 'custom_analyzer',
              fields: {
                keyword: { type: 'keyword' },
              },
            },
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
      refresh: false, // Performance optimization: let ES manage refresh intervals
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
   * Search for concepts with fuzzy matching and highlighting.
   */
  /**
   * Search for concepts with fuzzy matching, highlighting, filtering, and sorting.
   */
  async search(
    query?: string,
    limit = 20,
    offset = 0,
    options?: {
      level?: number;
      fields?: string[];
      sort?: string[];
    },
  ): Promise<SearchResult> {
    // 1. Build Query
    const searchFields =
      options?.fields && options.fields.length > 0
        ? options.fields
        : ['label^3', 'definition', 'variants^2'];

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

    // 2. Build Sort
    const sort: any[] = [];
    if (options?.sort && options.sort.length > 0) {
      options.sort.forEach((s) => {
        const [field, order] = s.split(':');
        if (field) {
          // Map text fields to their keyword sub-field for sorting
          const sortField =
            field === 'label' || field === 'definition' || field === 'variants'
              ? `${field}.keyword`
              : field;
          sort.push({
            [sortField]: { order: order === 'asc' ? 'asc' : 'desc' },
          });
        }
      });
    } else {
      // Default sort by score (relevance)
      sort.push({ _score: 'desc' });
    }

    const response = await this.elasticsearchService.search({
      index: this.indexName,
      from: offset,
      size: limit,
      query: {
        bool: {
          must,
          filter,
        },
      },
      sort,
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

    const hits = response.hits.hits;
    const total = response.hits.total as SearchTotalHits;

    return {
      concepts: hits.map((hit) => {
        const source = hit._source as ConceptDocument;
        return {
          ...source,
          _score: hit._score || 0,
          _highlight: hit.highlight,
        };
      }),
      total: typeof total === 'number' ? total : total.value,
      took: response.took || 0,
    };
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
