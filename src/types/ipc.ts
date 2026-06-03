import type { RowFilter, SortSpec } from "./domain";

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected: number;
  duration_ms: number;
}

export interface ColumnMeta {
  name: string;
  decl_type: string;
}

export interface RowPage {
  columns: ColumnMeta[];
  rows: unknown[][];
  next_offset: number | null;
  total_estimate: number;
}

export interface GetRowsArgs {
  tab_id: string;
  table: string;
  offset: number;
  page_size: number;
  filters: RowFilter[];
  sort: SortSpec | null;
}

export interface RowEditRequest {
  tab_id: string;
  table: string;
  pk_columns: string[];
  pk_values: unknown[];
  changes: Record<string, unknown>;
}

export interface InsertRowRequest {
  tab_id: string;
  table: string;
  values: Record<string, unknown>;
}

export interface DeleteRowsRequest {
  tab_id: string;
  table: string;
  pk_columns: string[];
  pk_values_list: unknown[][];
}

export interface ColumnDef {
  name: string;
  type_name: string;
  notnull: boolean;
  default_value: string | null;
  primary_key: boolean;
}

export interface CreateTableRequest {
  tab_id: string;
  name: string;
  columns: ColumnDef[];
}

export interface CreateIndexRequest {
  tab_id: string;
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

export interface DropRequest {
  tab_id: string;
  kind: "table" | "index" | "view" | "trigger";
  name: string;
}

export interface TableOverview {
  name: string;
  row_count: number;
  page_count: number | null;
}

export interface DbOverview {
  file_size_bytes: number | null;
  page_size: number;
  page_count: number;
  free_pages: number;
  journal_mode: string;
  integrity_ok: boolean;
  integrity_errors: string[];
  tables: TableOverview[];
}

export interface PgTableStat {
  schema: string;
  name: string;
  rows: number;
  size_bytes: number;
  index_size_bytes: number;
}

export interface PgOverview {
  engine: "pg";
  db_size_bytes: number;
  dead_tuples_total: number;
  tables: PgTableStat[];
}

export interface MysqlTableStat {
  schema: string;
  name: string;
  engine: string;
  rows: number;
  data_length: number;
  index_length: number;
  collation: string | null;
}

export interface MysqlOverview {
  engine: "mysql";
  default_charset: string;
  tables: MysqlTableStat[];
}

export interface ColumnStats {
  column: string;
  null_count: number;
  distinct_count: number;
  min_value: unknown;
  max_value: unknown;
}

export interface SearchOptions {
  case_sensitive: boolean;
  use_regex: boolean;
  tables: string[] | null;
}

export interface SearchHit {
  table: string;
  column: string;
  row_index: number;
  value: unknown;
}

export type ExportFormatId =
  | "csv" | "csv_excel" | "tsv"
  | "json" | "sql" | "xml" | "yaml" | "markdown";

export interface ExportRequest {
  tab_id: string;
  sql: string;
  format: ExportFormatId;
  path: string;
  job_id?: string;

  table_name?: string;
  include_structure?: boolean;
  include_data?: boolean;
  drop_table?: boolean;
  if_not_exists?: boolean;
  batch_size?: number;
}

export interface ExportProgress {
  written: number;
  total_estimate: number;
}

export interface IpcError {
  code: string;
  message: string;
}
