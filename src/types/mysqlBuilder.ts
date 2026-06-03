import type { MysqlSchemaSnapshot } from "./mysqlSchema";

export type MysqlFkAction = "NO ACTION" | "RESTRICT" | "SET NULL" | "SET DEFAULT" | "CASCADE";
export type MysqlIndexMethod = "BTREE" | "HASH" | "FULLTEXT" | "SPATIAL";
export type MysqlEngine = "InnoDB" | "MyISAM" | "Aria" | "MEMORY" | "ARCHIVE" | "CSV";

export interface MysqlDraftColumn {
  id: string;
  serverId?: string;
  name: string;
  dataType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  fsp: number | null;
  unsigned: boolean;
  zerofill: boolean;
  notNull: boolean;
  autoIncrement: boolean;
  defaultExpr: string | null;
  onUpdateCurrentTimestamp: boolean;
  enumValues: string[];
  setValues: string[];
  invisible: boolean;
  generatedExpr: string | null;
  generatedStored: boolean;
  comment: string;
  collation: string | null;
  check: string | null;
  fk: {
    refTable: string;
    refColumn: string;
    onDelete: MysqlFkAction;
    onUpdate: MysqlFkAction;
  } | null;
}

export interface MysqlDraftIndexColumn {
  columnName: string;
  expression: string | null;
  prefixLength: number | null;
  direction: "ASC" | "DESC";
}

export interface MysqlDraftIndex {
  id: string;
  serverId?: string;
  name: string;
  table: string;
  method: MysqlIndexMethod;
  columns: MysqlDraftIndexColumn[];
  unique: boolean;
}

export interface MysqlDraftConstraint {
  id: string;
  serverId?: string;
  kind: "UNIQUE" | "CHECK" | "FOREIGN";
  name: string;
  columns: string[];
  checkExpr: string;
  fkColumns: string[];
  fkRefTable: string;
  fkRefColumns: string[];
  fkOnDelete: MysqlFkAction;
  fkOnUpdate: MysqlFkAction;
}

export interface MysqlDraftTable {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  columns: MysqlDraftColumn[];
  primaryKey: { columns: string[] } | null;
  constraints: MysqlDraftConstraint[];
  engine: MysqlEngine;
  charset: string;
  collate: string;
  rowFormat?: string | null;
  autoIncrementStart: number | null;
  comment: string;
  systemVersioned: boolean;
}

export interface MysqlDraftView {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  body: string;
}

export interface MysqlDraftTrigger {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  table: string;
  timing: "BEFORE" | "AFTER";
  event: "INSERT" | "UPDATE" | "DELETE";
  body: string;
}

export interface MysqlDraftRoutine {
  id: string;
  serverId?: string;
  schema: string;
  name: string;
  kind: "FUNCTION" | "PROCEDURE";
  parameters: string;
  returns: string | null;
  body: string;
  deterministic: boolean;
  dataAccess: "NO SQL" | "READS SQL DATA" | "MODIFIES SQL DATA" | "CONTAINS SQL";
  sqlSecurity: "DEFINER" | "INVOKER";
}

export interface MysqlDraftSequence {
  schema: string;
  name: string;
  startWith: number;
  incrementBy: number;
  minValue: number;
  maxValue: number;
  cache: number;
  cycle: boolean;
}

export interface MysqlBuilderDraft {
  kind: "mysql";
  tabId: string;
  currentDatabase: string;
  availableDatabases: string[];
  tables: MysqlDraftTable[];
  indexes: MysqlDraftIndex[];
  views: MysqlDraftView[];
  triggers: MysqlDraftTrigger[];
  routines: MysqlDraftRoutine[];
  sequences: MysqlDraftSequence[];
  flavor: "mysql" | "mariadb";
  snapshot: MysqlSchemaSnapshot;
}

export type MysqlBuilderSelection =
  | { kind: "table"; id: string }
  | { kind: "index"; id: string }
  | { kind: "view"; id: string }
  | { kind: "trigger"; id: string }
  | { kind: "routine"; id: string }
  | { kind: "sequence"; name: string }
  | null;

export interface MysqlDraftError {
  kind: "table" | "column" | "index" | "view" | "trigger" | "routine" | "global";
  objectId?: string;
  columnId?: string;
  message: string;
}
