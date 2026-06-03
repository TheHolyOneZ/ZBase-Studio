export interface MysqlColumnInfo {
  name: string;
  ordinal: number;
  data_type: string;
  column_type: string;
  character_max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  datetime_precision: number | null;
  nullable: boolean;
  default_value: string | null;
  extra: string;
  comment: string;
  collation: string | null;
  unsigned: boolean;
  zerofill: boolean;
  auto_increment: boolean;
  on_update_current_timestamp: boolean;
  invisible: boolean;
  generated_expression: string | null;
  generated_stored: boolean;
  enum_values: string[];
  set_values: string[];
}

export interface MysqlConstraintInfo {
  name: string;
  kind: "PRIMARY" | "UNIQUE" | "FOREIGN" | "CHECK" | string;
  columns: string[];
  check_expr: string | null;
  fk_ref_table: string | null;
  fk_ref_columns: string[];
  fk_on_update: string | null;
  fk_on_delete: string | null;
}

export interface MysqlIndexColumnInfo {
  column_name: string;
  sub_part: number | null;
  asc: boolean;
  expression: string | null;
}

export interface MysqlIndexInfo {
  name: string;
  unique: boolean;
  index_type: string;
  columns: MysqlIndexColumnInfo[];
  is_primary: boolean;
}

export interface MysqlTableFullInfo {
  schema: string;
  name: string;
  table_type: string;
  engine: string | null;
  charset: string | null;
  collation: string | null;
  comment: string;
  auto_increment: number | null;
  system_versioned: boolean;
  columns: MysqlColumnInfo[];
  constraints: MysqlConstraintInfo[];
  indexes: MysqlIndexInfo[];
}

export interface MysqlViewFullInfo {
  schema: string;
  name: string;
  definition: string;
  definer: string;
  security_type: string;
}

export interface MysqlRoutineFullInfo {
  schema: string;
  name: string;
  routine_type: string;
  return_type: string | null;
  deterministic: boolean;
  data_access: string;
  security_type: string;
  body: string;
  comment: string;
}

export interface MysqlTriggerFullInfo {
  schema: string;
  name: string;
  timing: string;
  event: string;
  table_name: string;
  statement: string;
  definer: string;
}

export interface MysqlSequenceInfo {
  schema: string;
  name: string;
  start_value: number;
  increment: number;
  min_value: number;
  max_value: number;
  cache_size: number;
  cycle: boolean;
}

export interface MysqlSchemaSnapshot {
  current_database: string;
  available_databases: string[];
  tables: MysqlTableFullInfo[];
  views: MysqlViewFullInfo[];
  routines: MysqlRoutineFullInfo[];
  triggers: MysqlTriggerFullInfo[];
  sequences: MysqlSequenceInfo[];
  flavor: "mysql" | "mariadb";
}
