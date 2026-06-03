import type { PgSchemaSnapshot } from "./pgSchema";

export type PgFkAction = "NO ACTION" | "RESTRICT" | "SET NULL" | "SET DEFAULT" | "CASCADE";
export type PgIndexMethod = "btree" | "hash" | "gin" | "gist" | "brin" | "spgist";

export interface PgType {
  base: string;
  length?: number;
  precision?: number;
  scale?: number;
  array?: boolean;
  withTimezone?: boolean;
}

export interface PgIdentity {
  generation: "ALWAYS" | "BY DEFAULT";
}

export interface PgDraftColumn {
  id: string;
  serverId?: string;
  name: string;
  type: PgType;
  notNull: boolean;
  identity: PgIdentity | null;
  defaultExpr: string | null;
  generated?: { expression: string; stored: boolean } | null;
  check: string | null;
  collation: string | null;
  comment: string | null;
  fk: {
    schema: string;
    table: string;
    column: string;
    onDelete: PgFkAction;
    onUpdate: PgFkAction;
    deferrable: boolean;
    initiallyDeferred: boolean;
  } | null;
}

export interface PgDraftUnique {
  id: string;
  name: string | null;
  columns: string[];
}

export interface PgDraftCheck {
  id: string;
  name: string | null;
  expr: string;
}

export interface PgDraftTable {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  columns: PgDraftColumn[];
  primaryKey: { name: string | null; columns: string[] } | null;
  uniques: PgDraftUnique[];
  checks: PgDraftCheck[];
  comment: string | null;
  unlogged: boolean;
  temporary: boolean;
}

export interface PgDraftIndexColumn {
  expr: string;
  direction: "ASC" | "DESC";
  nulls: "FIRST" | "LAST";
}

export interface PgDraftIndex {
  id: string;
  serverId?: string;
  name: string;
  schema: string;
  table: string;
  method: PgIndexMethod;
  columns: PgDraftIndexColumn[];
  unique: boolean;
  whereClause: string | null;
  comment: string | null;
}

export interface PgDraftView {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  sql: string;
  materialized: boolean;
  comment: string | null;
}

export interface PgDraftFunction {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  language: "plpgsql" | "sql";
  returnsTrigger: boolean;
  returns: string;
  securityDefiner: boolean;
  parameters: string;
  body: string;
  comment: string | null;
}

export interface PgDraftTrigger {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  table: string;
  timing: "BEFORE" | "AFTER" | "INSTEAD OF";
  events: Array<"INSERT" | "UPDATE" | "DELETE" | "TRUNCATE">;
  forEach: "ROW" | "STATEMENT";
  whenClause: string | null;
  functionId: string;
  comment: string | null;
}

export interface PgDraftEnum {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  values: string[];
}

export interface PgBuilderDraft {
  kind: "pg";
  tabId: string;
  defaultSchema: string;
  availableSchemas: string[];
  tables: PgDraftTable[];
  indexes: PgDraftIndex[];
  views: PgDraftView[];
  functions: PgDraftFunction[];
  triggers: PgDraftTrigger[];
  enums: PgDraftEnum[];
  snapshot: PgSchemaSnapshot;
}

export interface PgDraftError {
  kind: "table" | "column" | "index" | "view" | "trigger" | "function" | "enum" | "global";
  objectId?: string;
  columnId?: string;
  message: string;
  statementIndex?: number;
}

export type { DestructiveOp } from "./builderShared";

export type PgBuilderSelection =
  | { kind: "table"; id: string }
  | { kind: "index"; id: string }
  | { kind: "view"; id: string }
  | { kind: "function"; id: string }
  | { kind: "trigger"; id: string }
  | { kind: "enum"; id: string }
  | null;
