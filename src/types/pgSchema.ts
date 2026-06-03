export interface PgColumnInfo {
  name: string;
  ordinal: number;
  udt_name: string;
  data_type: string;
  character_max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_array: boolean;
  not_null: boolean;
  default_value: string | null;
  is_identity: boolean;
  identity_generation: "ALWAYS" | "BY DEFAULT" | null;
  collation: string | null;
  comment: string | null;
  generated_expression: string | null;
  generated_stored: boolean;
}

export interface PgConstraintInfo {
  name: string;
  kind: "p" | "u" | "f" | "c" | string;
  columns: string[];
  check_expr: string | null;
  fk_ref_schema: string | null;
  fk_ref_table: string | null;
  fk_ref_columns: string[] | null;
  fk_on_update: string | null;
  fk_on_delete: string | null;
  deferrable: boolean;
  initially_deferred: boolean;
}

export interface PgIndexColumnInfo {
  expr: string;
  direction: "ASC" | "DESC";
  nulls: "FIRST" | "LAST";
}

export interface PgIndexFullInfo {
  name: string;
  unique: boolean;
  method: string;
  columns: PgIndexColumnInfo[];
  where_clause: string | null;
  is_primary: boolean;
  is_unique_constraint: boolean;
}

export interface PgTableFullInfo {
  schema: string;
  name: string;
  kind: string;
  comment: string | null;
  columns: PgColumnInfo[];
  constraints: PgConstraintInfo[];
  indexes: PgIndexFullInfo[];
}

export interface PgFunctionFullInfo {
  schema: string;
  name: string;
  language: string;
  returns_trigger: boolean;
  parameters: string;
  body: string;
}

export interface PgTriggerFullInfo {
  schema: string;
  name: string;
  table_schema: string;
  table: string;
  timing: string;
  events: string[];
  for_each: string;
  when_clause: string | null;
  function_schema: string;
  function_name: string;
}

export interface PgViewFullInfo {
  schema: string;
  name: string;
  definition: string;
  materialized: boolean;
}

export interface PgEnumFullInfo {
  schema: string;
  name: string;
  values: string[];
}

export interface PgSchemaSnapshot {
  default_schema: string;
  available_schemas: string[];
  tables: PgTableFullInfo[];
  views: PgViewFullInfo[];
  functions: PgFunctionFullInfo[];
  triggers: PgTriggerFullInfo[];
  enums: PgEnumFullInfo[];
}
