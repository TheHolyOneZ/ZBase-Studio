import type { TableSchema } from "../types/schema";

export interface ColumnDraft {
  originalName: string | null;
  name: string;
  type: string;
  notNull: boolean;
  pk: number;
  unique: boolean;
  defaultExpr: string | null;
}

export interface TableDraft {
  originalName: string;
  newName: string;
  columns: ColumnDraft[];
}

function q(s: string) { return `"${s.replace(/"/g, '""')}"`; }

export function draftFromSchema(t: TableSchema): TableDraft {
  return {
    originalName: t.name,
    newName: t.name,
    columns: t.columns.map((c) => ({
      originalName: c.name,
      name: c.name,
      type: c.type_name || "TEXT",
      notNull: c.notnull,
      pk: c.pk,
      unique: t.indexes.some((idx) => idx.unique && idx.columns.length === 1 && idx.columns[0] === c.name),
      defaultExpr: c.default_value ?? null,
    })),
  };
}

function colDef(c: ColumnDraft): string {
  let s = `${q(c.name)} ${c.type || "TEXT"}`;
  if (c.pk === 1 && !c.notNull) s += " PRIMARY KEY";          // single-col PK implies NOT NULL
  else if (c.pk > 0) s += " PRIMARY KEY";
  if (c.notNull && c.pk === 0) s += " NOT NULL";
  if (c.unique && c.pk === 0) s += " UNIQUE";
  if (c.defaultExpr) s += ` DEFAULT ${c.defaultExpr}`;
  return s;
}

export function generateAlterSql(original: TableSchema, draft: TableDraft): string {
  const stmts: string[] = [];

  const origCols = original.columns;
  const draftExisting = draft.columns.filter((c) => c.originalName !== null);
  const newCols = draft.columns.filter((c) => c.originalName === null);
  const droppedNames = origCols
    .map((c) => c.name)
    .filter((n) => !draft.columns.some((d) => d.originalName === n));

  // Detect what changed in existing columns
  const typeOrConstraintChanged = draftExisting.some((d) => {
    const orig = origCols.find((c) => c.name === d.originalName);
    if (!orig) return false;
    const typeChanged = (d.type || "TEXT").toUpperCase() !== (orig.type_name || "TEXT").toUpperCase();
    const nnChanged = d.notNull !== orig.notnull;
    const pkChanged = (d.pk > 0) !== (orig.pk > 0);
    return typeChanged || nnChanged || pkChanged;
  });

  const needsMigration = typeOrConstraintChanged || droppedNames.length > 0;

  if (needsMigration) {
    // Full migration: CREATE temp → INSERT SELECT → DROP → RENAME
    const tmpName = `__zbase_new__${draft.newName || draft.originalName}`;
    const colDefs = draft.columns.map(colDef).join(", ");

    // Build the INSERT column mapping: new name → old name (for renames)
    const insertCols = draft.columns
      .filter((d) => d.originalName !== null)
      .map((d) => q(d.name))
      .join(", ");
    const selectCols = draft.columns
      .filter((d) => d.originalName !== null)
      .map((d) => q(d.originalName!))
      .join(", ");

    stmts.push(`BEGIN;`);
    stmts.push(`CREATE TABLE ${q(tmpName)} (${colDefs});`);
    if (insertCols) {
      stmts.push(`INSERT INTO ${q(tmpName)} (${insertCols})\n  SELECT ${selectCols} FROM ${q(draft.originalName)};`);
    }
    stmts.push(`DROP TABLE ${q(draft.originalName)};`);
    stmts.push(`ALTER TABLE ${q(tmpName)} RENAME TO ${q(draft.newName || draft.originalName)};`);
    stmts.push(`COMMIT;`);
    return stmts.join("\n");
  }

  // Simple ALTER statements
  // 1. Rename columns
  for (const d of draftExisting) {
    if (d.originalName && d.name !== d.originalName) {
      stmts.push(`ALTER TABLE ${q(draft.originalName)} RENAME COLUMN ${q(d.originalName)} TO ${q(d.name)};`);
    }
  }
  // 2. Add new columns
  for (const c of newCols) {
    stmts.push(`ALTER TABLE ${q(draft.originalName)} ADD COLUMN ${colDef(c)};`);
  }
  // 3. Rename table (last, so prior stmts still reference original name)
  if (draft.newName && draft.newName !== draft.originalName) {
    stmts.push(`ALTER TABLE ${q(draft.originalName)} RENAME TO ${q(draft.newName)};`);
  }

  if (stmts.length === 0) return "-- No changes";
  return stmts.join("\n");
}
