export interface ColumnInfo {
  cid: number;
  name: string;
  type_name: string;
  notnull: boolean;
  default_value: string | null;
  pk: number;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface ForeignKey {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKey[];
  row_count_estimate: number | null;
  sql?: string;
}

export interface ViewSchema {
  name: string;
  sql: string;
}

export interface TriggerSchema {
  name: string;
  table_name: string;
  sql: string;
}

export interface SchemaSnapshot {
  tables: TableSchema[];
  views: ViewSchema[];
  triggers: TriggerSchema[];
}
