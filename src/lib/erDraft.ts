import type { SchemaSnapshot } from "../types/schema";
import type { BuilderDraft, DraftColumn } from "../types/builder";
import { schemaToBuilderDraft } from "./schemaToDraft";

export interface ErDraft extends BuilderDraft {
  snapshot: SchemaSnapshot;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enrichColumn(col: DraftColumn, tableSql: string): DraftColumn {


  const colPat = new RegExp(
    `"?${escapeRegex(col.name)}"?\\s+[^,)]*`,
    "i",
  );
  const m = tableSql.match(colPat);
  if (!m) return col;
  const def = m[0];

  const autoincrement = /\bAUTOINCREMENT\b/i.test(def);
  const unique = /\bUNIQUE\b/i.test(def);
  const collateMatch = /\bCOLLATE\s+(BINARY|NOCASE|RTRIM)\b/i.exec(def);
  const checkMatch = /\bCHECK\s*\(([^)]+)\)/i.exec(def);

  return {
    ...col,
    autoincrement: autoincrement || col.autoincrement,
    unique: unique || col.unique,
    collate: collateMatch
      ? (collateMatch[1].toUpperCase() as "BINARY" | "NOCASE" | "RTRIM")
      : col.collate,
    check: checkMatch ? checkMatch[1] : col.check,
  };
}

function enrichFromSql(draft: BuilderDraft, snapshot: SchemaSnapshot): BuilderDraft {
  return {
    ...draft,
    tables: draft.tables.map((draftTable) => {
      const schemaTable = snapshot.tables.find((t) => t.name === draftTable.name);
      const sql = schemaTable?.sql;
      if (!sql) return draftTable;

      return {
        ...draftTable,
        withoutRowid: /WITHOUT\s+ROWID/i.test(sql),
        strict: /\bSTRICT\b(?:\s*;?\s*$)/i.test(sql),
        columns: draftTable.columns.map((col) => enrichColumn(col, sql)),
      };
    }),
  };
}

export function schemaToErDraft(snapshot: SchemaSnapshot, _tabId?: string): ErDraft {
  const label = "ER Edit";
  const { draft } = schemaToBuilderDraft(snapshot, label);
  const enriched = enrichFromSql(draft, snapshot);
  return { ...enriched, snapshot };
}
