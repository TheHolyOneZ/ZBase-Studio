import type { BuilderDraft, DraftColumn, DraftError, DraftTable } from "../types/builder";

function esc(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function colDdl(col: DraftColumn, inCompositePk: boolean): string {
  const parts: string[] = [`${esc(col.name)} ${col.type || "TEXT"}`];

  if (col.primaryKey && !inCompositePk) {
    parts.push("PRIMARY KEY");
    if (col.autoincrement) parts.push("AUTOINCREMENT");
  }
  if (col.notNull && !col.primaryKey) parts.push("NOT NULL");
  if (col.unique && !col.primaryKey) parts.push("UNIQUE");
  if (col.collate) parts.push(`COLLATE ${col.collate}`);
  if (col.defaultExpr !== null && col.defaultExpr !== "") {
    parts.push(`DEFAULT (${col.defaultExpr})`);
  }
  if (col.check !== null && col.check !== "") {
    parts.push(`CHECK (${col.check})`);
  }
  if (col.fk) {
    const { table, column, onDelete, onUpdate } = col.fk;
    parts.push(
      `REFERENCES ${esc(table)}(${esc(column)}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`,
    );
  }

  return parts.join(" ");
}

function tableDdl(t: DraftTable): string {
  const inCompositePk = t.compositePk !== null && t.compositePk.length > 1;
  const defs: string[] = t.columns.map((c) => colDdl(c, inCompositePk));

  if (inCompositePk && t.compositePk) {
    defs.push(`PRIMARY KEY (${t.compositePk.map(esc).join(", ")})`);
  }

  for (const chk of t.tableChecks) {
    if (chk.trim()) defs.push(`CHECK (${chk})`);
  }

  const flags: string[] = [];
  if (t.withoutRowid) flags.push("WITHOUT ROWID");
  if (t.strict) flags.push("STRICT");

  const flagStr = flags.length > 0 ? ` ${flags.join(", ")}` : "";
  return `CREATE TABLE ${esc(t.name)} (\n  ${defs.join(",\n  ")}\n)${flagStr};`;
}

export interface DdlResult {
  sql: string;
  errors: DraftError[];
}

export function buildDdl(draft: BuilderDraft): DdlResult {
  const errors: DraftError[] = [];
  const tableNames = new Set<string>();

  for (const t of draft.tables) {
    if (!t.name.trim()) {
      errors.push({ kind: "table", objectId: t.id, message: "Table name cannot be empty" });
      continue;
    }
    if (t.name.toLowerCase().startsWith("sqlite_")) {
      errors.push({ kind: "table", objectId: t.id, message: 'Table names starting with "sqlite_" are reserved' });
    }
    if (tableNames.has(t.name.toLowerCase())) {
      errors.push({ kind: "table", objectId: t.id, message: `Duplicate table name: "${t.name}"` });
    }
    tableNames.add(t.name.toLowerCase());

    if (t.columns.length === 0) {
      errors.push({ kind: "table", objectId: t.id, message: "Table must have at least one column" });
    }

    const colNames = new Set<string>();
    let pkCount = 0;
    for (const c of t.columns) {
      if (!c.name.trim()) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: "Column name cannot be empty" });
      }
      if (colNames.has(c.name.toLowerCase())) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `Duplicate column name: "${c.name}"` });
      }
      colNames.add(c.name.toLowerCase());

      if (c.primaryKey) pkCount++;
      if (c.autoincrement && (!c.primaryKey || c.type.toUpperCase() !== "INTEGER")) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: "AUTOINCREMENT requires INTEGER PRIMARY KEY" });
      }
      if (c.fk) {
        const target = draft.tables.find((x) => x.name === c.fk!.table);
        if (!target) {
          errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `FK references unknown table "${c.fk.table}"` });
        } else {
          const targetCol = target.columns.find((x) => x.name === c.fk!.column);
          if (!targetCol) {
            errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `FK references unknown column "${c.fk.column}" in "${c.fk.table}"` });
          }
        }
      }
    }

    if (t.compositePk && t.compositePk.length > 1 && pkCount > 0) {
      errors.push({ kind: "table", objectId: t.id, message: "Cannot combine per-column PRIMARY KEY with composite PK" });
    }
    if (t.compositePk) {
      for (const pkCol of t.compositePk) {
        if (!t.columns.find((c) => c.name === pkCol)) {
          errors.push({ kind: "table", objectId: t.id, message: `Composite PK references unknown column "${pkCol}"` });
        }
      }
    }
  }

  for (const idx of draft.indexes) {
    if (!idx.name.trim()) {
      errors.push({ kind: "index", objectId: idx.id, message: "Index name cannot be empty" });
    }
    const tbl = draft.tables.find((t) => t.name === idx.table);
    if (!tbl) {
      errors.push({ kind: "index", objectId: idx.id, message: `Index references unknown table "${idx.table}"` });
    } else {
      for (const col of idx.columns) {
        if (!tbl.columns.find((c) => c.name === col)) {
          errors.push({ kind: "index", objectId: idx.id, message: `Index references unknown column "${col}" in "${idx.table}"` });
        }
      }
    }
    if (idx.columns.length === 0) {
      errors.push({ kind: "index", objectId: idx.id, message: "Index must reference at least one column" });
    }
  }

  for (const v of draft.views) {
    if (!v.name.trim()) {
      errors.push({ kind: "view", objectId: v.id, message: "View name cannot be empty" });
    }
  }

  for (const trig of draft.triggers) {
    if (!trig.name.trim()) {
      errors.push({ kind: "trigger", objectId: trig.id, message: "Trigger name cannot be empty" });
    }
    if (!draft.tables.find((t) => t.name === trig.table)) {
      errors.push({ kind: "trigger", objectId: trig.id, message: `Trigger references unknown table "${trig.table}"` });
    }
  }

  const stmts: string[] = [];

  for (const t of draft.tables) {
    if (!t.name.trim() || t.columns.length === 0) continue;
    try { stmts.push(tableDdl(t)); } catch { /* skip malformed */ }
  }

  for (const idx of draft.indexes) {
    if (!idx.name.trim() || idx.columns.length === 0) continue;
    const unique = idx.unique ? "UNIQUE " : "";
    const cols = idx.columns.map(esc).join(", ");
    const where = idx.whereClause?.trim() ? ` WHERE ${idx.whereClause}` : "";
    stmts.push(`CREATE ${unique}INDEX ${esc(idx.name)} ON ${esc(idx.table)} (${cols})${where};`);
  }

  for (const v of draft.views) {
    if (!v.name.trim()) continue;
    stmts.push(`CREATE VIEW ${esc(v.name)} AS\n${v.sql};`);
  }

  for (const trig of draft.triggers) {
    if (!trig.name.trim()) continue;
    const when = trig.whenClause?.trim() ? `\n  WHEN ${trig.whenClause}` : "";
    stmts.push(
      `CREATE TRIGGER ${esc(trig.name)} ${trig.timing} ${trig.event} ON ${esc(trig.table)}${when}\nBEGIN\n  ${trig.body}\nEND;`,
    );
  }

  return { sql: stmts.join("\n\n"), errors };
}

export function validateDraft(draft: BuilderDraft): DraftError[] {
  return buildDdl(draft).errors;
}
