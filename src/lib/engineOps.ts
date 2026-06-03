import {
  getRows, applyRowEdit, insertRow, deleteRows, getDbSchema, executeQuery,
  getPgRows, applyPgRowEdit, insertPgRow, deletePgRows, getPgSchema, executePgQuery,
  getMysqlRows, applyMysqlRowEdit, insertMysqlRow, deleteMysqlRows, getMysqlSchema, executeMysqlQuery,
} from "../ipc/commands";
import type { GetRowsArgs, RowEditRequest, InsertRowRequest, DeleteRowsRequest, RowPage, QueryResult } from "../types/ipc";
import type { SchemaSnapshot } from "../types/schema";

export interface RowOps {
  getRows: (args: GetRowsArgs) => Promise<RowPage>;
  applyRowEdit: (req: RowEditRequest) => Promise<void>;
  insertRow: (req: InsertRowRequest) => Promise<void>;
  deleteRows: (req: DeleteRowsRequest) => Promise<void>;
  getSchema: (tabId: string) => Promise<SchemaSnapshot>;
}

export interface QueryOps {
  execute: (tabId: string, sql: string) => Promise<QueryResult>;
  getSchema: (tabId: string) => Promise<SchemaSnapshot>;
}

export function engineRowOps(engine: string | undefined): RowOps {
  switch (engine) {
    case "postgres":
      return { getRows: getPgRows, applyRowEdit: applyPgRowEdit, insertRow: insertPgRow, deleteRows: deletePgRows, getSchema: getPgSchema };
    case "mysql":
    case "mariadb":
      return { getRows: getMysqlRows, applyRowEdit: applyMysqlRowEdit, insertRow: insertMysqlRow, deleteRows: deleteMysqlRows, getSchema: getMysqlSchema };
    default:
      return { getRows, applyRowEdit, insertRow, deleteRows, getSchema: getDbSchema };
  }
}

export function engineQueryOps(engine: string | undefined): QueryOps {
  switch (engine) {
    case "postgres":
      return { execute: (id, sql) => executePgQuery(id, sql) as Promise<QueryResult>, getSchema: getPgSchema };
    case "mysql":
    case "mariadb":
      return { execute: (id, sql) => executeMysqlQuery(id, sql) as Promise<QueryResult>, getSchema: getMysqlSchema };
    default:
      return { execute: executeQuery, getSchema: getDbSchema };
  }
}
