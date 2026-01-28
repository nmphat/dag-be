import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type Concept = {
    id: string;
    label: string;
    definition: string | null;
    level: Generated<number>;
    created_at: Generated<Timestamp>;
    updated_at: Generated<Timestamp>;
};
export type Edge = {
    parent_id: string;
    child_id: string;
    created_at: Generated<Timestamp>;
};
export type Variant = {
    id: Generated<number>;
    concept_id: string;
    name: string;
    created_at: Generated<Timestamp>;
};
export type DB = {
    concepts: Concept;
    edges: Edge;
    variants: Variant;
};
