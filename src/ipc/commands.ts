import { invoke } from "@tauri-apps/api/core";
import type { SchemaSnapshot } from "../types/schema";
import type { PgSchemaSnapshot } from "../types/pgSchema";
import type {
  ColumnStats,
  CreateIndexRequest,
  CreateTableRequest,
  DbOverview,
  PgOverview,
  MysqlOverview,
  DeleteRowsRequest,
  DropRequest,
  ExportRequest,
  GetRowsArgs,
  InsertRowRequest,
  QueryResult,
  RowEditRequest,
  RowPage,
  SearchOptions,
} from "../types/ipc";

export const openDb = (path: string) =>
  invoke<string>("open_db", { path });

export const openDuckDb = (path: string) =>
  invoke<string>("open_duck_db", { path });

export const closeDb = (tabId: string) =>
  invoke<void>("close_db", { tabId: tabId });

export const getDbSchema = (tabId: string) =>
  invoke<SchemaSnapshot>("get_db_schema", { tabId });

export const getRows = (args: GetRowsArgs) =>
  invoke<RowPage>("get_rows", {
    tabId: args.tab_id,
    table: args.table,
    offset: args.offset,
    pageSize: args.page_size,
    filters: args.filters,
    sort: args.sort,
  });

export const executeQuery = (tabId: string, sql: string) =>
  invoke<QueryResult>("execute_query", { tabId, sql });

export const applyRowEdit = (req: RowEditRequest) =>
  invoke<void>("apply_row_edit", { req });

export const insertRow = (req: InsertRowRequest) =>
  invoke<void>("insert_row", { req });

export const deleteRows = (req: DeleteRowsRequest) =>
  invoke<void>("delete_rows", { req });

export const beginTxn = (tabId: string) =>
  invoke<void>("begin_txn", { tabId });

export const commitTxn = (tabId: string) =>
  invoke<void>("commit_txn", { tabId });

export const rollbackTxn = (tabId: string) =>
  invoke<void>("rollback_txn", { tabId });

export const createTable = (req: CreateTableRequest) =>
  invoke<string>("create_table", { req });

export const createIndex = (req: CreateIndexRequest) =>
  invoke<string>("create_index", { req });

export const dropObject = (req: DropRequest) =>
  invoke<string>("drop_object", { req });

export const executeDdl = (tabId: string, sql: string) =>
  invoke<void>("execute_ddl", { tabId, sql });

export const applySchemaPlan = (tabId: string, statements: string[], requiresFkOff: boolean, rebuiltTables: string[]) =>
  invoke<void>("apply_schema_plan", { tabId, statements, requiresFkOff, rebuiltTables });

export const computeOverview = (tabId: string) =>
  invoke<DbOverview>("compute_overview", { tabId });

export const computeColumnStats = (tabId: string, table: string, column: string) =>
  invoke<ColumnStats>("compute_column_stats", { tabId, table, column });

export const startFullSearch = (tabId: string, jobId: string, needle: string, opts: SearchOptions) =>
  invoke<void>("start_full_search", { tabId, jobId, needle, opts });

export const cancelJob = (jobId: string) =>
  invoke<void>("cancel_job", { jobId });

export const computePgOverview = (tabId: string) =>
  invoke<PgOverview>("compute_pg_overview", { tabId });

export const computeMysqlOverview = (tabId: string) =>
  invoke<MysqlOverview>("compute_mysql_overview", { tabId });

export const startPgFullSearch = (tabId: string, jobId: string, needle: string, opts: SearchOptions) =>
  invoke<void>("start_pg_full_search", { tabId, jobId, needle, opts });

export const startMysqlFullSearch = (tabId: string, jobId: string, needle: string, opts: SearchOptions) =>
  invoke<void>("start_mysql_full_search", { tabId, jobId, needle, opts });

export const startExport = (req: ExportRequest) =>
  invoke<string>("start_export", { req });

export interface DbExportRequest {
  tab_id: string;
  format: "sql" | "db";
  path: string;
  include_structure?: boolean;
  include_data?: boolean;
  include_indexes?: boolean;
  include_views?: boolean;
  include_triggers?: boolean;
  drop_tables?: boolean;
  if_not_exists?: boolean;
  insert_mode?: "insert" | "replace" | "ignore";
  batch_size?: number;
  wrap_transaction?: boolean;
  disable_fk_checks?: boolean;
  add_comments?: boolean;
}

export const exportDatabase = (req: DbExportRequest & { job_id?: string }) =>
  invoke<string>("export_database", { req });

export interface PgDbExportRequest {
  tab_id: string;
  path: string;
  job_id?: string;
  include_structure?: boolean;
  include_data?: boolean;
  include_views?: boolean;
  include_functions?: boolean;
  include_triggers?: boolean;
  include_enums?: boolean;
  drop_objects?: boolean;
  if_not_exists?: boolean;
  disable_triggers?: boolean;
  wrap_transaction?: boolean;
  insert_mode?: "insert" | "on_conflict_do_nothing";
  batch_size?: number;
  add_comments?: boolean;
}

export const exportPgDatabase = (req: PgDbExportRequest) =>
  invoke<string>("export_pg_database", { req });

export interface MysqlDbExportRequest {
  tab_id: string;
  path: string;
  job_id?: string;
  include_structure?: boolean;
  include_data?: boolean;
  include_views?: boolean;
  include_routines?: boolean;
  include_triggers?: boolean;
  drop_objects?: boolean;
  if_not_exists?: boolean;
  disable_fk_checks?: boolean;
  disable_unique_checks?: boolean;
  wrap_transaction?: boolean;
  insert_mode?: "insert" | "replace" | "ignore";
  batch_size?: number;
  add_comments?: boolean;
  charset_header?: boolean;
}

export const exportMysqlDatabase = (req: MysqlDbExportRequest) =>
  invoke<string>("export_mysql_database", { req });

export type FileKind =
  | { kind: "sqlite" }
  | { kind: "duckdb" }
  | { kind: "script"; size: number; fits_editor: boolean };

export const detectFileKind = (path: string) =>
  invoke<FileKind>("detect_file_kind", { path });

export const readSqlFile = (path: string) =>
  invoke<string>("read_sql_file", { path });

export const executeSqlFile = (tabId: string, path: string) =>
  invoke<{ duration_ms: number; statements_hint: number; skipped_hint: number; skipped_detail: string | null }>("execute_sql_file", { tabId, path });

export interface ImportSqlResult {
  executed: number;
  failed: number;
  duration_ms: number;
  errors: { index: number; preview: string; message: string }[];
}

export const executePgSqlFile = (tabId: string, path: string, stopOnError: boolean) =>
  invoke<ImportSqlResult>("execute_pg_sql_file", { tabId, path, stopOnError });

export const executeMysqlSqlFile = (tabId: string, path: string, stopOnError: boolean) =>
  invoke<ImportSqlResult>("execute_mysql_sql_file", { tabId, path, stopOnError });

export interface CsvColumnPreview {
  name: string;
  inferred_type: string;
  nullable: boolean;
}

export interface CsvSchemaPreview {
  columns: CsvColumnPreview[];
  sample_rows: string[][];
  total_rows_estimate: number;
}

export interface CsvImportRequest {
  tab_id: string;
  path: string;
  table_name: string;
  columns: [string, string][];
  delimiter: string;
  has_header: boolean;
  batch_size?: number;
}

export const inferCsvSchema = (path: string, delimiter: string, hasHeader: boolean) =>
  invoke<CsvSchemaPreview>("infer_csv_schema", { path, delimiter, hasHeader });

export const importCsv = (req: CsvImportRequest) =>
  invoke<string>("import_csv", { req });


export interface PgConnectRequest {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslMode: "disable" | "prefer" | "require";
}

export interface PgQueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected: number;
  duration_ms: number;
}

export const getPgRows = (args: GetRowsArgs) =>
  invoke<RowPage>("get_pg_rows", {
    tabId: args.tab_id,
    table: args.table,
    offset: args.offset,
    pageSize: args.page_size,
    filters: args.filters,
    sort: args.sort,
  });

export const applyPgRowEdit = (req: RowEditRequest) =>
  invoke<void>("apply_pg_row_edit", { req });

export const insertPgRow = (req: InsertRowRequest) =>
  invoke<void>("insert_pg_row", { req });

export const deletePgRows = (req: DeleteRowsRequest) =>
  invoke<void>("delete_pg_rows", { req });

export const openPgDb = (req: PgConnectRequest) =>
  invoke<string>("open_pg_db", { req });

export const closePgDb = (tabId: string) =>
  invoke<void>("close_pg_db", { tabId });

export const getPgSchema = (tabId: string) =>
  invoke<SchemaSnapshot>("get_pg_schema", { tabId });

export const executePgQuery = (tabId: string, sql: string) =>
  invoke<PgQueryResult>("execute_pg_query", { tabId, sql });

export const executePgDdl = (tabId: string, sql: string) =>
  invoke<void>("execute_pg_ddl", { tabId, sql });

export const getPgSchemaFull = (tabId: string) =>
  invoke<PgSchemaSnapshot>("get_pg_schema_full", { tabId });

export const executePgDdlAtomic = (tabId: string, statements: string[]) =>
  invoke<void>("execute_pg_ddl_atomic", { tabId, statements });


export interface MysqlConnectRequest {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  flavor: "mysql" | "mariadb";
}

export interface MysqlQueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected: number;
  duration_ms: number;
}

export const getMysqlRows = (args: GetRowsArgs) =>
  invoke<RowPage>("get_mysql_rows", {
    tabId: args.tab_id,
    table: args.table,
    offset: args.offset,
    pageSize: args.page_size,
    filters: args.filters,
    sort: args.sort,
  });

export const applyMysqlRowEdit = (req: RowEditRequest) =>
  invoke<void>("apply_mysql_row_edit", { req });

export const insertMysqlRow = (req: InsertRowRequest) =>
  invoke<void>("insert_mysql_row", { req });

export const deleteMysqlRows = (req: DeleteRowsRequest) =>
  invoke<void>("delete_mysql_rows", { req });

export const openMysqlDb = (req: MysqlConnectRequest) =>
  invoke<string>("open_mysql_db", { req });

export const closeMysqlDb = (tabId: string) =>
  invoke<void>("close_mysql_db", { tabId });

export const getMysqlSchema = (tabId: string) =>
  invoke<SchemaSnapshot>("get_mysql_schema", { tabId });

export const executeMysqlQuery = (tabId: string, sql: string) =>
  invoke<MysqlQueryResult>("execute_mysql_query", { tabId, sql });

export const executeMysqlDdl = (tabId: string, sql: string) =>
  invoke<void>("execute_mysql_ddl", { tabId, sql });

export const getMysqlSchemaFull = (tabId: string) =>
  invoke<import("../types/mysqlSchema").MysqlSchemaSnapshot>("get_mysql_schema_full", { tabId });

export const executeMysqlDdlAtomic = (tabId: string, statements: string[]) =>
  invoke<void>("execute_mysql_ddl_atomic", { tabId, statements });
