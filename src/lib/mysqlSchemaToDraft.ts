import type { MysqlSchemaSnapshot, MysqlTableFullInfo, MysqlColumnInfo, MysqlConstraintInfo } from "../types/mysqlSchema";
import type {
  MysqlBuilderDraft, MysqlDraftTable, MysqlDraftColumn, MysqlDraftIndex,
  MysqlDraftView, MysqlDraftTrigger, MysqlDraftRoutine, MysqlDraftSequence,
  MysqlDraftConstraint, MysqlFkAction, MysqlEngine, MysqlIndexMethod,
} from "../types/mysqlBuilder";

function mapFkAction(s: string | null): MysqlFkAction {
  switch (s) {
    case "RESTRICT": return "RESTRICT";
    case "CASCADE": return "CASCADE";
    case "SET NULL": return "SET NULL";
    case "SET DEFAULT": return "SET DEFAULT";
    default: return "NO ACTION";
  }
}

function mapColumn(col: MysqlColumnInfo, schema: string, table: string, constraints: MysqlConstraintInfo[]): MysqlDraftColumn {

  const fkCon = constraints.find(
    (c) => c.kind === "FOREIGN" && c.columns.length === 1 && c.columns[0] === col.name
  );
  const fk = fkCon ? {
    refTable: fkCon.fk_ref_table ?? "",
    refColumn: fkCon.fk_ref_columns?.[0] ?? "",
    onDelete: mapFkAction(fkCon.fk_on_delete),
    onUpdate: mapFkAction(fkCon.fk_on_update),
  } : null;


  const checkCon = constraints.find(
    (c) => c.kind === "CHECK" && c.columns.length === 1 && c.columns[0] === col.name
  );
  const check = checkCon?.check_expr ?? null;

  return {
    id: crypto.randomUUID(),
    serverId: `${schema}.${table}.${col.name}`,
    name: col.name,
    dataType: col.data_type.toUpperCase(),
    length: col.character_max_length,
    precision: col.numeric_precision,
    scale: col.numeric_scale,
    fsp: col.datetime_precision,
    unsigned: col.unsigned,
    zerofill: col.zerofill,
    notNull: !col.nullable,
    autoIncrement: col.auto_increment,
    defaultExpr: col.default_value,
    onUpdateCurrentTimestamp: col.on_update_current_timestamp,
    enumValues: col.enum_values,
    setValues: col.set_values,
    invisible: col.invisible,
    generatedExpr: col.generated_expression,
    generatedStored: col.generated_stored,
    comment: col.comment,
    collation: col.collation,
    check,
    fk,
  };
}

function mapTable(t: MysqlTableFullInfo): MysqlDraftTable {
  const columns = t.columns.map((c) => mapColumn(c, t.schema, t.name, t.constraints));

  const pkCon = t.constraints.find((c) => c.kind === "PRIMARY");
  const primaryKey = pkCon ? { columns: pkCon.columns } : null;

  const columnNames = new Set(t.columns.map((c) => c.name));

  const constraints: MysqlDraftConstraint[] = [];
  for (const c of t.constraints) {
    if (c.kind === "PRIMARY") continue;

    if (c.kind === "CHECK" && c.columns.length === 1 && columnNames.has(c.columns[0])) continue;
    const con: MysqlDraftConstraint = {
      id: crypto.randomUUID(),
      serverId: `${t.schema}.${t.name}.${c.name}`,
      kind: c.kind as "UNIQUE" | "CHECK" | "FOREIGN",
      name: c.name,
      columns: c.columns,
      checkExpr: c.check_expr ?? "",
      fkColumns: c.columns,
      fkRefTable: c.fk_ref_table ?? "",
      fkRefColumns: c.fk_ref_columns ?? [],
      fkOnDelete: mapFkAction(c.fk_on_delete),
      fkOnUpdate: mapFkAction(c.fk_on_update),
    };
    constraints.push(con);
  }


  const charset = t.charset ?? (t.collation?.split("_")[0] ?? "utf8mb4");

  return {
    id: crypto.randomUUID(),
    serverId: `${t.schema}.${t.name}`,
    schema: t.schema,
    name: t.name,
    columns,
    primaryKey,
    constraints,
    engine: (t.engine as MysqlEngine) ?? "InnoDB",
    charset,
    collate: t.collation ?? "",
    autoIncrementStart: t.auto_increment,
    comment: t.comment,
    systemVersioned: t.system_versioned,
  };
}

export function mysqlSchemaToDraft(snapshot: MysqlSchemaSnapshot, tabId: string): MysqlBuilderDraft {
  const tables: MysqlDraftTable[] = snapshot.tables.map(mapTable);

  const indexes: MysqlDraftIndex[] = snapshot.tables.flatMap((t) =>
    t.indexes
      .filter((ix) => !ix.is_primary && !t.constraints.find((c) => c.kind === "UNIQUE" && c.name === ix.name))
      .map((ix) => ({
        id: crypto.randomUUID(),
        serverId: `${t.schema}.${t.name}.${ix.name}`,
        name: ix.name,
        table: t.name,
        method: ix.index_type.toUpperCase() as MysqlIndexMethod,
        columns: ix.columns.map((c) => ({
          columnName: c.expression ? "" : c.column_name,
          expression: c.expression ?? null,
          prefixLength: c.sub_part,
          direction: c.asc ? "ASC" : "DESC" as "ASC" | "DESC",
        })),
        unique: ix.unique,
      }))
  );

  const views: MysqlDraftView[] = snapshot.views.map((v) => ({
    id: crypto.randomUUID(),
    serverId: `${v.schema}.${v.name}`,
    schema: v.schema,
    name: v.name,
    body: v.definition,
  }));

  const triggers: MysqlDraftTrigger[] = snapshot.triggers.map((tr) => ({
    id: crypto.randomUUID(),
    serverId: `${tr.schema}.${tr.name}`,
    schema: tr.schema,
    name: tr.name,
    table: tr.table_name,
    timing: tr.timing as "BEFORE" | "AFTER",
    event: tr.event as "INSERT" | "UPDATE" | "DELETE",
    body: tr.statement,
  }));

  const routines: MysqlDraftRoutine[] = snapshot.routines.map((r) => ({
    id: crypto.randomUUID(),
    serverId: `${r.schema}.${r.name}`,
    schema: r.schema,
    name: r.name,
    kind: r.routine_type as "FUNCTION" | "PROCEDURE",
    parameters: "",
    returns: r.return_type,
    body: r.body,
    deterministic: r.deterministic,
    dataAccess: r.data_access as MysqlDraftRoutine["dataAccess"],
    sqlSecurity: r.security_type as "DEFINER" | "INVOKER",
  }));

  const sequences: MysqlDraftSequence[] = snapshot.sequences.map((s) => ({
    schema: s.schema,
    name: s.name,
    startWith: s.start_value,
    incrementBy: s.increment,
    minValue: s.min_value,
    maxValue: s.max_value,
    cache: s.cache_size,
    cycle: s.cycle,
  }));

  return {
    kind: "mysql",
    tabId,
    currentDatabase: snapshot.current_database,
    availableDatabases: snapshot.available_databases,
    tables,
    indexes,
    views,
    triggers,
    routines,
    sequences,
    flavor: snapshot.flavor,
    snapshot,
  };
}
