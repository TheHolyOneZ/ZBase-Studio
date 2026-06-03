import type { SchemaSnapshot, TableSchema } from "../types/schema";
import type { BuilderDraft, DraftColumn, DraftIndex, DraftTable, DraftTrigger, DraftView, FkAction } from "../types/builder";

function toFkAction(s: string): FkAction {
  const upper = s.toUpperCase();
  if (upper === "CASCADE") return "CASCADE";
  if (upper === "RESTRICT") return "RESTRICT";
  if (upper === "SET NULL") return "SET NULL";
  if (upper === "SET DEFAULT") return "SET DEFAULT";
  return "NO ACTION";
}

function tableToDto(t: TableSchema): DraftTable {
  const fkMap: Record<string, { table: string; column: string; onDelete: FkAction; onUpdate: FkAction }> = {};
  for (const fk of t.foreign_keys) {
    fkMap[fk.from] = {
      table: fk.table,
      column: fk.to,
      onDelete: toFkAction(fk.on_delete),
      onUpdate: toFkAction(fk.on_update),
    };
  }

  const pkCols = t.columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
  const isCompositePk = pkCols.length > 1;

  const columns: DraftColumn[] = t.columns.map((c) => ({
    id: crypto.randomUUID(),
    name: c.name,
    type: c.type_name || "TEXT",
    primaryKey: !isCompositePk && c.pk > 0,
    autoincrement: false,
    notNull: c.notnull,
    unique: false,
    defaultExpr: c.default_value,
    check: null,
    collate: null,
    fk: fkMap[c.name] ?? null,
  }));

  return {
    id: crypto.randomUUID(),
    name: t.name,
    columns,
    compositePk: isCompositePk ? pkCols.map((c) => c.name) : null,
    tableChecks: [],
    withoutRowid: false,
    strict: false,
  };
}

export function schemaToBuilderDraft(snapshot: SchemaSnapshot, label: string): { draft: BuilderDraft } {
  const tables: DraftTable[] = snapshot.tables.map(tableToDto);

  const indexes: DraftIndex[] = snapshot.tables.flatMap((t) =>
    t.indexes.map((ix) => ({
      id: crypto.randomUUID(),
      name: ix.name,
      table: t.name,
      columns: ix.columns,
      unique: ix.unique,
      whereClause: null,
    })),
  );

  const views: DraftView[] = snapshot.views.map((v) => ({
    id: crypto.randomUUID(),
    name: v.name,
    sql: v.sql,
  }));

  const triggers: DraftTrigger[] = snapshot.triggers.map((tr) => ({
    id: crypto.randomUUID(),
    name: tr.name,
    table: tr.table_name,
    timing: "AFTER" as const,
    event: "INSERT" as const,
    whenClause: null,
    body: tr.sql,
  }));

  return { draft: { label, tables, indexes, views, triggers } };
}
