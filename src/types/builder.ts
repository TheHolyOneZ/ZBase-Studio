export type FkAction = "NO ACTION" | "RESTRICT" | "SET NULL" | "SET DEFAULT" | "CASCADE";
export type CollateMode = "BINARY" | "NOCASE" | "RTRIM";

export interface DraftColumn {
  id: string;
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  autoincrement: boolean;
  unique: boolean;
  defaultExpr: string | null;
  check: string | null;
  collate: CollateMode | null;
  fk: {
    table: string;
    column: string;
    onDelete: FkAction;
    onUpdate: FkAction;
  } | null;
}

export interface DraftTable {
  id: string;
  name: string;
  columns: DraftColumn[];
  compositePk: string[] | null;
  tableChecks: string[];
  withoutRowid: boolean;
  strict: boolean;
}

export interface DraftIndex {
  id: string;
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  whereClause: string | null;
}

export interface DraftView {
  id: string;
  name: string;
  sql: string;
}

export interface DraftTrigger {
  id: string;
  name: string;
  table: string;
  timing: "BEFORE" | "AFTER" | "INSTEAD OF";
  event: "INSERT" | "UPDATE" | "DELETE";
  whenClause: string | null;
  body: string;
}

export interface BuilderDraft {
  label: string;
  tables: DraftTable[];
  indexes: DraftIndex[];
  views: DraftView[];
  triggers: DraftTrigger[];
}

export interface DraftError {
  kind: "table" | "column" | "index" | "view" | "trigger";
  objectId: string;
  columnId?: string;
  message: string;
}

export type BuilderSelection =
  | { kind: "table"; id: string }
  | { kind: "index"; id: string }
  | { kind: "view"; id: string }
  | { kind: "trigger"; id: string }
  | null;
