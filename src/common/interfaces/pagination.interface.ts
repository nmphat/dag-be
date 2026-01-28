export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// src/concepts/interfaces/search.interface.ts
export interface SearchResultItem {
  id: string;
  label: string;
  level: number;
  definition?: string;
  matchedOn: 'label' | 'variant';
  highlight?: string;
  parents: { id: string; label: string }[];
}

export interface SearchResponse extends PaginatedResponse<SearchResultItem> {
  meta: {
    query: string;
    took: number;
  };
}
