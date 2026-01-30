export interface DomainConcept {
  id: string; // VarChar(10)
  label: string;
  definition: string | null;
  level: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PathChunk {
  type: 'path' | 'progress' | 'done' | 'error';
  path?: DomainConcept[];
  progress?: { found: number; processed: number };
  error?: string;
}

export interface StreamOptions {
  maxDepth?: number;
  maxPaths?: number;
  concurrency?: number;
}
