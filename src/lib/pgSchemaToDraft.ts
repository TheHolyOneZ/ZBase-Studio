import type { PgSchemaSnapshot, PgColumnInfo, PgConstraintInfo } from "../types/pgSchema";
import type {
  PgBuilderDraft, PgDraftTable, PgDraftColumn, PgDraftIndex,
  PgDraftView, PgDraftFunction, PgDraftTrigger, PgType, PgFkAction,
  PgDraftUnique, PgDraftCheck, PgIdentity, PgDraftEnum,
} from "../types/pgBuilder";

function mapFkAction(s: string | null): PgFkAction {
  switch (s) {
    case "RESTRICT": return "RESTRICT";
    case "CASCADE": return "CASCADE";
    case "SET NULL": return "SET NULL";
    case "SET DEFAULT": return "SET DEFAULT";
    default: return "NO ACTION";
  }
}

function udtToType(col: PgColumnInfo): PgType {
  const base = col.udt_name.replace(/^_/, "");
  const isArray = col.is_array || col.udt_name.startsWith("_");
  const withTimezone = base === "timestamptz" || base === "timetz";

  const t: PgType = { base };
  if (col.character_max_length != null) t.length = col.character_max_length;
  if (col.numeric_precision != null) {
    t.precision = col.numeric_precision;
    if (col.numeric_scale != null) t.scale = col.numeric_scale;
  }
  if (isArray) t.array = true;
  if (withTimezone) t.withTimezone = true;
  return t;
}

function mapIdentity(col: PgColumnInfo): PgIdentity | null {
  if (col.is_identity && col.identity_generation) {
    return { generation: col.identity_generation as "ALWAYS" | "BY DEFAULT" };
  }

  if (col.default_value && col.default_value.startsWith("nextval(")) {
    return { generation: "BY DEFAULT" };
  }
  return null;
}


function stripCheckWrapper(expr: string): string {
  const m = expr.match(/^CHECK \(([\s\S]+)\)$/);
  return m ? m[1] : expr;
}

function mapColumn(col: PgColumnInfo, schema: string, table: string, constraints: PgConstraintInfo[]): PgDraftColumn {
  const identity = mapIdentity(col);
  const isSerial = col.default_value?.startsWith("nextval(") && !col.is_identity;
  const defaultExpr = identity ? null : (isSerial ? null : col.default_value);


  const generated = col.generated_expression
    ? { expression: col.generated_expression, stored: col.generated_stored }
    : null;


  const fkCon = constraints.find(
    (c) => c.kind === "f" && c.columns.length === 1 && c.columns[0] === col.name
  );
  const fk = fkCon ? {
    schema: fkCon.fk_ref_schema ?? "public",
    table: fkCon.fk_ref_table ?? "",
    column: fkCon.fk_ref_columns?.[0] ?? "",
    onDelete: mapFkAction(fkCon.fk_on_delete),
    onUpdate: mapFkAction(fkCon.fk_on_update),
    deferrable: fkCon.deferrable,
    initiallyDeferred: fkCon.initially_deferred,
  } : null;


  const checkCon = constraints.find(
    (c) => c.kind === "c" && c.columns.length === 1 && c.columns[0] === col.name
  );
  const check = checkCon?.check_expr ? stripCheckWrapper(checkCon.check_expr) : null;

  return {
    id: crypto.randomUUID(),
    serverId: `${schema}.${table}.${col.name}`,
    name: col.name,
    type: udtToType(col),
    notNull: col.not_null,
    identity,
    defaultExpr,
    generated,
    check,
    collation: col.collation,
    comment: col.comment,
    fk,
  };
}

function mapTable(t: { schema: string; name: string; kind: string; comment: string | null; columns: PgColumnInfo[]; constraints: PgConstraintInfo[]; indexes: import("../types/pgSchema").PgIndexFullInfo[] }, _defaultSchema: string): PgDraftTable {
  const columns = t.columns.map((c) => mapColumn(c, t.schema, t.name, t.constraints));


  const pkCon = t.constraints.find((c) => c.kind === "p");
  const primaryKey = pkCon ? { name: pkCon.name, columns: pkCon.columns } : null;


  const uniques: PgDraftUnique[] = t.constraints
    .filter((c) => c.kind === "u")
    .map((c) => ({ id: crypto.randomUUID(), name: c.name || null, columns: c.columns }));


  const checks: PgDraftCheck[] = t.constraints
    .filter((c) => c.kind === "c")
    .map((c) => ({
      id: crypto.randomUUID(),
      name: c.name || null,
      expr: c.check_expr ? stripCheckWrapper(c.check_expr) : "",
    }));

  return {
    id: crypto.randomUUID(),
    serverId: `${t.schema}.${t.name}`,
    schema: t.schema,
    name: t.name,
    columns,
    primaryKey,
    uniques,
    checks,
    comment: t.comment,
    unlogged: t.kind === "u",
    temporary: t.kind === "t",
  };
}

export function pgSchemaToDraft(snapshot: PgSchemaSnapshot, tabId: string): PgBuilderDraft {
  const tables: PgDraftTable[] = snapshot.tables.map((t) => mapTable(t, snapshot.default_schema));

  const indexes: PgDraftIndex[] = snapshot.tables.flatMap((t) =>
    t.indexes
      .filter((ix) => !ix.is_primary && !ix.is_unique_constraint)
      .map((ix) => ({
        id: crypto.randomUUID(),
        serverId: `${t.schema}.${ix.name}`,
        name: ix.name,
        schema: t.schema,
        table: t.name,
        method: ix.method as PgDraftIndex["method"],
        columns: ix.columns.map((c) => ({
          expr: c.expr,
          direction: c.direction as "ASC" | "DESC",
          nulls: c.nulls as "FIRST" | "LAST",
        })),
        unique: ix.unique,
        whereClause: ix.where_clause,
        comment: null,
      }))
  );

  const views: PgDraftView[] = snapshot.views.map((v) => ({
    id: crypto.randomUUID(),
    serverId: `${v.schema}.${v.name}`,
    schema: v.schema,
    name: v.name,
    sql: v.definition,
    materialized: v.materialized,
    comment: null,
  }));

  const functions: PgDraftFunction[] = snapshot.functions.map((f) => ({
    id: crypto.randomUUID(),
    serverId: `${f.schema}.${f.name}`,
    schema: f.schema,
    name: f.name,
    language: (f.language === "sql" ? "sql" : "plpgsql") as "plpgsql" | "sql",
    returnsTrigger: f.returns_trigger,
    returns: "",
    securityDefiner: false,
    parameters: f.parameters ?? "",
    body: f.body,
    comment: null,
  }));

  const triggers: PgDraftTrigger[] = snapshot.triggers.map((tr) => {
    const fn = functions.find(
      (f) => f.schema === tr.function_schema && f.name === tr.function_name
    );
    return {
      id: crypto.randomUUID(),
      serverId: `${tr.schema}.${tr.name}`,
      schema: tr.schema,
      name: tr.name,
      table: tr.table,
      timing: tr.timing as "BEFORE" | "AFTER" | "INSTEAD OF",
      events: tr.events as Array<"INSERT" | "UPDATE" | "DELETE" | "TRUNCATE">,
      forEach: tr.for_each as "ROW" | "STATEMENT",
      whenClause: tr.when_clause,
      functionId: fn?.id ?? "",
      comment: null,
    };
  });

  const enums: PgDraftEnum[] = (snapshot.enums ?? []).map((e) => ({
    id: crypto.randomUUID(),
    serverId: `${e.schema}.${e.name}`,
    schema: e.schema,
    name: e.name,
    values: e.values,
  }));

  return {
    kind: "pg",
    tabId,
    defaultSchema: snapshot.default_schema,
    availableSchemas: snapshot.available_schemas,
    tables,
    indexes,
    views,
    functions,
    triggers,
    enums,
    snapshot,
  };
}
