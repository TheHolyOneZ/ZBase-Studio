import type { SchemaSnapshot, TableSchema } from "../types/schema";
import type { BuilderDraft, DraftTable } from "../types/builder";
import { buildDdl } from "./buildDdl";

export type PlanOp =
  | { kind: "drop_index"; name: string }
  | { kind: "drop_table"; name: string }
  | { kind: "create_table"; createSql: string }
  | { kind: "add_column"; table: string; colSql: string }
  | { kind: "rebuild_table"; name: string; createSql: string; commonCols: string[] }
  | { kind: "create_index"; createSql: string };

export interface SchemaPlan {
  ops: PlanOp[];
  requiresFkOff: boolean;
}

function esc(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function tableCreateSql(draftTable: DraftTable, fullDraft: BuilderDraft): string {
  const { sql } = buildDdl({ ...fullDraft, tables: [draftTable], indexes: [], views: [], triggers: [] });
  return sql.trim();
}

function columnsNeedRebuild(snapTable: TableSchema, draftTable: DraftTable): boolean {
  const draftColNames = new Set(draftTable.columns.map((c) => c.name));
  const snapPkCols = snapTable.columns.filter((c) => c.pk > 0);
  const isSinglePk = snapPkCols.length === 1;
  const isSnapCompositePk = snapPkCols.length > 1;
  const snapSql = snapTable.sql ?? "";

  // Dropped columns
  for (const sc of snapTable.columns) {
    if (!draftColNames.has(sc.name)) return true;
  }

  // Changed existing columns (type, notnull, pk, fk presence/target/actions)
  for (const dc of draftTable.columns) {
    const sc = snapTable.columns.find((c) => c.name === dc.name);
    if (!sc) continue; // new column — handled as add_column

    const snapFk = snapTable.foreign_keys.find((fk) => fk.from === dc.name);
    if (
      dc.type.toUpperCase() !== (sc.type_name || "TEXT").toUpperCase() ||
      dc.notNull !== sc.notnull ||
      dc.primaryKey !== (sc.pk > 0 && isSinglePk) ||
      !!dc.fk !== !!snapFk ||
      (dc.fk && snapFk && (
        dc.fk.table !== snapFk.table ||
        dc.fk.column !== snapFk.to ||
        dc.fk.onDelete.toUpperCase() !== (snapFk.on_delete || "NO ACTION").toUpperCase() ||
        dc.fk.onUpdate.toUpperCase() !== (snapFk.on_update || "NO ACTION").toUpperCase()
      ))
    ) {
      return true;
    }
  }

  // WITHOUT ROWID / STRICT — compare against snapshot SQL
  const snapWithoutRowid = /WITHOUT\s+ROWID/i.test(snapSql);
  const snapStrict = /\bSTRICT\b/i.test(snapSql);
  if (draftTable.withoutRowid !== snapWithoutRowid) return true;
  if (draftTable.strict !== snapStrict) return true;

  // Composite PK — compare against snapshot's actual PK structure
  const draftIsCompositePk = draftTable.compositePk !== null && draftTable.compositePk.length > 1;
  if (draftIsCompositePk !== isSnapCompositePk) return true;
  if (draftIsCompositePk && isSnapCompositePk && draftTable.compositePk) {
    const snapPkNames = snapPkCols.sort((a, b) => a.pk - b.pk).map((c) => c.name);
    if (JSON.stringify(snapPkNames) !== JSON.stringify(draftTable.compositePk)) return true;
  }

  // Table CHECK constraints — only trigger rebuild if user explicitly added one
  if (draftTable.tableChecks.some((c) => c.trim())) return true;

  return false;
}

function diffTable(snapTable: TableSchema, draftTable: DraftTable, fullDraft: BuilderDraft): PlanOp[] {
  const ops: PlanOp[] = [];
  const snapColNameSet = new Set(snapTable.columns.map((c) => c.name));

  if (columnsNeedRebuild(snapTable, draftTable)) {
    const createSql = tableCreateSql(draftTable, fullDraft);
    const commonCols = draftTable.columns
      .filter((c) => snapColNameSet.has(c.name))
      .map((c) => c.name);
    ops.push({ kind: "rebuild_table", name: draftTable.name, createSql, commonCols });
  } else {
    // Only new columns added — safe ADD COLUMN for each
    for (const dc of draftTable.columns) {
      if (!snapColNameSet.has(dc.name)) {
        let colSql = `${esc(dc.name)} ${dc.type || "TEXT"}`;
        if (dc.notNull) colSql += " NOT NULL";
        if (dc.defaultExpr) colSql += ` DEFAULT (${dc.defaultExpr})`;
        ops.push({ kind: "add_column", table: draftTable.name, colSql });
      }
    }
  }

  return ops;
}

export function diffDrafts(snapshot: SchemaSnapshot, draft: BuilderDraft): SchemaPlan {
  const ops: PlanOp[] = [];

  const snapshotTableNames = new Set(snapshot.tables.map((t) => t.name));
  const draftTableNames = new Set(draft.tables.map((t) => t.name));
  const snapshotIndexNames = new Set(
    snapshot.tables.flatMap((t) => t.indexes.map((i) => i.name)),
  );
  const draftIndexNames = new Set(draft.indexes.map((i) => i.name));

  // 1. Drop indexes that are gone (before tables)
  for (const t of snapshot.tables) {
    for (const idx of t.indexes) {
      if (!draftIndexNames.has(idx.name)) {
        ops.push({ kind: "drop_index", name: idx.name });
      }
    }
  }

  // 2. Drop tables that are gone
  for (const name of snapshotTableNames) {
    if (!draftTableNames.has(name)) {
      ops.push({ kind: "drop_table", name });
    }
  }

  // 3. Create new tables / diff existing
  for (const draftTable of draft.tables) {
    if (!draftTable.name.trim()) continue;
    const snapTable = snapshot.tables.find((t) => t.name === draftTable.name);

    if (!snapTable) {
      const createSql = tableCreateSql(draftTable, draft);
      if (createSql) {
        ops.push({ kind: "create_table", createSql });
      }
    } else {
      ops.push(...diffTable(snapTable, draftTable, draft));
    }
  }

  // 4. Create new indexes
  for (const draftIdx of draft.indexes) {
    if (!draftIdx.name.trim() || !draftIdx.table.trim()) continue;
    if (!snapshotIndexNames.has(draftIdx.name)) {
      const unique = draftIdx.unique ? "UNIQUE " : "";
      const cols = draftIdx.columns.map((c) => esc(c)).join(", ");
      let idxSql = `CREATE ${unique}INDEX ${esc(draftIdx.name)} ON ${esc(draftIdx.table)} (${cols})`;
      if (draftIdx.whereClause) idxSql += ` WHERE ${draftIdx.whereClause}`;
      idxSql += ";";
      ops.push({ kind: "create_index", createSql: idxSql });
    }
  }

  const requiresFkOff = ops.some(
    (op) => op.kind === "rebuild_table" || op.kind === "drop_table",
  );

  return { ops, requiresFkOff };
}
