// Domain interfaces for concepts and edges

export interface DomainConcept {
  id: string;
  label: string;
  definition: string | null;
  level: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainEdge {
  parentId: string;
  childId: string;
  createdAt: Date;
  // Optional relations
  parent?: DomainConcept;
  child?: DomainConcept;
}

export interface DomainVariant {
  id: number;
  conceptId: string;
  name: string;
  createdAt: Date;
}
