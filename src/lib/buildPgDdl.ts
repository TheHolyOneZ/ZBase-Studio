import type {
  PgBuilderDraft, PgDraftColumn, PgDraftTable, PgDraftIndex, PgDraftView,
  PgDraftFunction, PgDraftTrigger, PgDraftEnum, PgType, PgDraftError, DestructiveOp,
} from "../types/pgBuilder";
import type { PgSchemaSnapshot, PgTableFullInfo, PgColumnInfo, PgIndexFullInfo } from "../types/pgSchema";


function qi(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qn(schema: string, name: string): string {
  return `${qi(schema)}.${qi(name)}`;
}

function pgLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}


export function renderPgType(t: PgType): string {
  let base = t.base.toLowerCase();
  if (t.withTimezone) {
    if (base === "timestamp") base = "timestamp with time zone";
    else if (base === "time") base = "time with time zone";
  }
  let out = base;
  if (t.length != null) {
    out += `(${t.length})`;
  } else if (t.precision != null && t.scale != null) {
    out += `(${t.precision}, ${t.scale})`;
  } else if (t.precision != null) {
    out += `(${t.precision})`;
  }
  if (t.array) out += "[]";
  return out.toUpperCase();
}


function normalizeBaseToUdt(base: string, withTimezone?: boolean): string {
  const b = base.toLowerCase().trim();
  if (withTimezone) {
    if (b === "timestamp") return "timestamptz";
    if (b === "time") return "timetz";
  }
  switch (b) {
    case "smallint": return "int2";
    case "integer": case "int": return "int4";
    case "bigint": return "int8";
    case "real": return "float4";
    case "double precision": return "float8";
    case "boolean": return "bool";
    case "character varying": case "varchar": return "varchar";
    case "character": case "char": return "bpchar";
    case "decimal": return "numeric";
    default: return b;
  }
}


function typeChanged(tc: PgDraftColumn, cc: PgColumnInfo): boolean {
  const snUdt = (cc.udt_name.startsWith("_") ? cc.udt_name.slice(1) : cc.udt_name).toLowerCase();
  const tgUdt = normalizeBaseToUdt(tc.type.base, tc.type.withTimezone);
  if (snUdt !== tgUdt) return true;
  if (!!tc.type.array !== cc.is_array) return true;
  if ((tc.type.length ?? null) !== cc.character_max_length) return true;
  if ((tc.type.precision ?? null) !== cc.numeric_precision) return true;
  if ((tc.type.scale ?? null) !== cc.numeric_scale) return true;
  return false;
}


function columnDef(col: PgDraftColumn): string {
  const parts: string[] = [qi(col.name), renderPgType(col.type)];
  if (col.generated) {
    const persistence = col.generated.stored ? "STORED" : "VIRTUAL";
    parts.push(`GENERATED ALWAYS AS (${col.generated.expression}) ${persistence}`);
  } else if (col.identity) {
    parts.push(`GENERATED ${col.identity.generation} AS IDENTITY`);
  } else if (col.defaultExpr) {
    parts.push(`DEFAULT ${col.defaultExpr}`);
  }
  if (col.notNull && !col.generated) parts.push("NOT NULL");
  if (col.check) parts.push(`CHECK (${col.check})`);
  if (col.collation) parts.push(`COLLATE "${col.collation}"`);
  if (col.fk) {
    const ref = qn(col.fk.schema, col.fk.table);
    parts.push(`REFERENCES ${ref}(${qi(col.fk.column)})`);
    if (col.fk.onUpdate !== "NO ACTION") parts.push(`ON UPDATE ${col.fk.onUpdate}`);
    if (col.fk.onDelete !== "NO ACTION") parts.push(`ON DELETE ${col.fk.onDelete}`);
    if (col.fk.deferrable) {
      parts.push("DEFERRABLE");
      if (col.fk.initiallyDeferred) parts.push("INITIALLY DEFERRED");
    }
  }
  return parts.join(" ");
}


function createTableSql(t: PgDraftTable): string {
  const lines: string[] = t.columns.map((c) => `  ${columnDef(c)}`);

  if (t.primaryKey && t.primaryKey.columns.length > 0) {
    const pk = t.primaryKey.columns.map(qi).join(", ");
    const name = t.primaryKey.name ? `CONSTRAINT ${qi(t.primaryKey.name)} ` : "";
    lines.push(`  ${name}PRIMARY KEY (${pk})`);
  }
  for (const u of t.uniques) {
    const cols = u.columns.map(qi).join(", ");
    const name = u.name ? `CONSTRAINT ${qi(u.name)} ` : "";
    lines.push(`  ${name}UNIQUE (${cols})`);
  }
  for (const ch of t.checks) {
    const name = ch.name ? `CONSTRAINT ${qi(ch.name)} ` : "";
    lines.push(`  ${name}CHECK (${ch.expr})`);
  }

  const tableOpts: string[] = [];
  if (t.unlogged) tableOpts.push("UNLOGGED");
  const tableOptStr = tableOpts.length ? `${tableOpts.join(" ")} ` : "";

  return `CREATE ${tableOptStr}TABLE ${qn(t.schema, t.name)} (\n${lines.join(",\n")}\n);`;
}


function createIndexSql(ix: PgDraftIndex): string {
  const unique = ix.unique ? "UNIQUE " : "";
  const method = ix.method !== "btree" ? ` USING ${ix.method}` : "";
  const cols = ix.columns.map((c) => {
    let s = c.expr.includes("(") ? c.expr : qi(c.expr);
    if (c.direction === "DESC") s += " DESC";
    if (c.nulls === "FIRST") s += " NULLS FIRST";
    if (c.nulls === "LAST") s += " NULLS LAST";
    return s;
  }).join(", ");
  const where = ix.whereClause ? ` WHERE ${ix.whereClause}` : "";
  return `CREATE ${unique}INDEX ${qi(ix.name)} ON ${qn(ix.schema, ix.table)}${method} (${cols})${where};`;
}


function createViewSql(v: PgDraftView): string {
  if (v.materialized) {
    return `CREATE MATERIALIZED VIEW ${qn(v.schema, v.name)} AS\n${v.sql};`;
  }
  return `CREATE OR REPLACE VIEW ${qn(v.schema, v.name)} AS\n${v.sql};`;
}


function createFunctionSql(f: PgDraftFunction): string {
  const returnType = f.returnsTrigger ? "trigger" : (f.returns?.trim() || "void");
  const params = f.parameters ?? "";
  const security = f.securityDefiner ? "\n  SECURITY DEFINER" : "";
  return `CREATE OR REPLACE FUNCTION ${qn(f.schema, f.name)}(${params})\n  RETURNS ${returnType}\n  LANGUAGE ${f.language}${security}\nAS $$\n${f.body}\n$$;`;
}


function createTriggerSql(tr: PgDraftTrigger, fnName: string, fnSchema: string): string {
  const events = tr.events.join(" OR ");
  const when = tr.whenClause ? ` WHEN (${tr.whenClause})` : "";
  return `CREATE TRIGGER ${qi(tr.name)}\n  ${tr.timing} ${events} ON ${qn(tr.schema, tr.table)}\n  FOR EACH ${tr.forEach}${when}\n  EXECUTE FUNCTION ${qn(fnSchema, fnName)}();`;
}


function createEnumSql(e: PgDraftEnum): string {
  const values = e.values.map(pgLiteral).join(", ");
  return `CREATE TYPE ${qn(e.schema, e.name)} AS ENUM (${values});`;
}


export function validatePgDraft(draft: PgBuilderDraft): PgDraftError[] {
  const errors: PgDraftError[] = [];
  const tableNames = new Set<string>();

  for (const t of draft.tables) {
    const key = `${t.schema}.${t.name}`;
    if (!t.name.trim()) {
      errors.push({ kind: "table", objectId: t.id, message: "Table name is required" });
    } else if (tableNames.has(key)) {
      errors.push({ kind: "table", objectId: t.id, message: `Duplicate table name: ${key}` });
    } else {
      tableNames.add(key);
    }
    if (t.columns.length === 0) {
      errors.push({ kind: "table", objectId: t.id, message: `Table "${t.name}" must have at least one column` });
    }
    const colNames = new Set<string>();
    for (const c of t.columns) {
      if (!c.name.trim()) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: "Column name is required" });
      } else if (colNames.has(c.name)) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `Duplicate column name: ${c.name}` });
      } else {
        colNames.add(c.name);
      }
      if (c.identity !== null && c.defaultExpr !== null) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: "Column cannot have both IDENTITY and DEFAULT" });
      }
    }
  }

  for (const ix of draft.indexes) {
    if (!ix.name.trim()) {
      errors.push({ kind: "index", objectId: ix.id, message: "Index name is required" });
    }
    if (!ix.table.trim()) {
      errors.push({ kind: "index", objectId: ix.id, message: "Index must reference a table" });
    }
    if (ix.columns.length === 0) {
      errors.push({ kind: "index", objectId: ix.id, message: `Index "${ix.name}" must have at least one column` });
    }
  }

  for (const v of draft.views) {
    if (!v.name.trim()) {
      errors.push({ kind: "view", objectId: v.id, message: "View name is required" });
    }
    if (!v.sql.trim()) {
      errors.push({ kind: "view", objectId: v.id, message: `View "${v.name}" must have a SELECT body` });
    }
  }

  for (const f of draft.functions) {
    if (!f.name.trim()) {
      errors.push({ kind: "function", objectId: f.id, message: "Function name is required" });
    }
  }

  const functionIds = new Set(draft.functions.map((f) => f.id));
  for (const tr of draft.triggers) {
    if (!tr.name.trim()) {
      errors.push({ kind: "trigger", objectId: tr.id, message: "Trigger name is required" });
    }
    if (!tr.table.trim()) {
      errors.push({ kind: "trigger", objectId: tr.id, message: "Trigger must reference a table" });
    }
    if (tr.events.length === 0) {
      errors.push({ kind: "trigger", objectId: tr.id, message: `Trigger "${tr.name}" must have at least one event` });
    }
    if (!tr.functionId) {
      errors.push({ kind: "trigger", objectId: tr.id, message: `Trigger "${tr.name}" must reference a function` });
    } else if (!functionIds.has(tr.functionId)) {
      errors.push({ kind: "trigger", objectId: tr.id, message: `Trigger "${tr.name}" references a function that no longer exists` });
    }
  }

  for (const e of (draft.enums ?? [])) {
    if (!e.name.trim()) {
      errors.push({ kind: "enum", objectId: e.id, message: "Enum name is required" });
    }
    if (e.values.length === 0) {
      errors.push({ kind: "enum", objectId: e.id, message: `Enum "${e.name}" must have at least one value` });
    }
  }

  return errors;
}


export function buildPgCreateDdl(draft: PgBuilderDraft): { sql: string; statements: string[]; errors: PgDraftError[] } {
  const errors = validatePgDraft(draft);
  if (errors.length > 0) return { sql: "", statements: [], errors };

  const stmts: string[] = [];
  for (const e of (draft.enums ?? [])) stmts.push(createEnumSql(e));
  for (const t of draft.tables) stmts.push(createTableSql(t));
  for (const ix of draft.indexes) stmts.push(createIndexSql(ix));
  for (const f of draft.functions) stmts.push(createFunctionSql(f));
  for (const v of draft.views) stmts.push(createViewSql(v));
  for (const tr of draft.triggers) {
    const fn = draft.functions.find((f) => f.id === tr.functionId);
    if (fn) stmts.push(createTriggerSql(tr, fn.name, fn.schema));
  }

  return { sql: stmts.join("\n\n"), statements: stmts, errors: [] };
}


export function diffPgDraft(
  current: PgSchemaSnapshot,
  target: PgBuilderDraft,
): { sql: string; statements: string[]; errors: PgDraftError[]; destructive: DestructiveOp[] } {
  const errors = validatePgDraft(target);
  if (errors.length > 0) return { sql: "", statements: [], errors, destructive: [] };

  const stmts: string[] = [];
  const destructive: DestructiveOp[] = [];

  const currentTables = new Map(current.tables.map((t) => [`${t.schema}.${t.name}`, t]));
  const currentEnums = new Map((current.enums ?? []).map((e) => [`${e.schema}.${e.name}`, e]));


  for (const tr of current.triggers) {
    const tKey = `${tr.schema}.${tr.name}`;
    if (!target.triggers.find((x) => x.serverId === tKey)) {
      stmts.push(`DROP TRIGGER IF EXISTS ${qi(tr.name)} ON ${qn(tr.table_schema, tr.table)};`);
      destructive.push({ kind: "drop_trigger", objectName: tKey, message: `Trigger "${tr.name}" will be dropped` });
    }
  }

  for (const v of current.views) {
    const vKey = `${v.schema}.${v.name}`;
    if (!target.views.find((x) => x.serverId === vKey)) {
      const mat = v.materialized ? "MATERIALIZED " : "";
      stmts.push(`DROP ${mat}VIEW IF EXISTS ${qn(v.schema, v.name)};`);
      destructive.push({ kind: "drop_view", objectName: vKey, message: `View "${v.name}" will be dropped` });
    }
  }

  for (const f of current.functions) {
    const fKey = `${f.schema}.${f.name}`;
    if (!target.functions.find((x) => x.serverId === fKey)) {
      stmts.push(`DROP FUNCTION IF EXISTS ${qn(f.schema, f.name)}(${f.parameters});`);
      destructive.push({ kind: "drop_function", objectName: fKey, message: `Function "${f.name}" will be dropped` });
    }
  }


  for (const t of current.tables) {
    for (const ix of t.indexes) {
      if (ix.is_primary || ix.is_unique_constraint) continue;
      const ixKey = `${t.schema}.${ix.name}`;
      if (!target.indexes.find((x) => x.serverId === ixKey)) {
        stmts.push(`DROP INDEX IF EXISTS ${qn(t.schema, ix.name)};`);
        destructive.push({ kind: "drop_index", objectName: ixKey, message: `Index "${ix.name}" will be dropped` });
      }
    }
  }


  for (const [srvKey, ct] of currentTables) {
    const tt = target.tables.find((x) => x.serverId === srvKey);
    if (!tt) continue;


    for (const cc of ct.columns) {
      const ccSrvId = `${ct.schema}.${ct.name}.${cc.name}`;
      if (!tt.columns.find((c) => c.serverId === ccSrvId)) {
        stmts.push(`ALTER TABLE ${qn(ct.schema, ct.name)} DROP COLUMN IF EXISTS ${qi(cc.name)};`);
        destructive.push({ kind: "drop_column", objectName: `${ct.name}.${cc.name}`, message: `Column "${cc.name}" will be dropped from "${ct.name}"` });
      }
    }


    for (const con of ct.constraints) {
      if (con.kind === "p" || !con.name) continue;

      if (con.kind === "f") {

        const colSrvId = `${ct.schema}.${ct.name}.${con.columns[0]}`;
        const targetCol = tt.columns.find((c) => c.serverId === colSrvId);
        if (targetCol && !targetCol.fk) {
          stmts.push(`ALTER TABLE ${qn(ct.schema, ct.name)} DROP CONSTRAINT IF EXISTS ${qi(con.name)};`);
          destructive.push({ kind: "drop_constraint", objectName: con.name, message: `FK constraint "${con.name}" will be dropped` });
        }
        continue;
      }

      const stillPresent =
        tt.uniques.some((u) => u.name === con.name) ||
        tt.checks.some((ch) => ch.name === con.name);
      if (!stillPresent) {
        stmts.push(`ALTER TABLE ${qn(ct.schema, ct.name)} DROP CONSTRAINT IF EXISTS ${qi(con.name)};`);
      }
    }
  }


  for (const [srvKey, ct] of currentTables) {
    if (!target.tables.find((x) => x.serverId === srvKey)) {
      stmts.push(`DROP TABLE IF EXISTS ${qn(ct.schema, ct.name)} CASCADE;`);
      destructive.push({ kind: "drop_table", objectName: srvKey, message: `Table "${ct.name}" will be dropped` });
    }
  }


  for (const [key, ce] of currentEnums) {
    if (!(target.enums ?? []).find((te) => te.serverId === key)) {
      stmts.push(`DROP TYPE IF EXISTS ${qn(ce.schema, ce.name)};`);
      destructive.push({ kind: "drop_enum", objectName: key, message: `Type "${ce.name}" will be dropped` });
    }
  }


  for (const tt of target.tables) {
    if (!tt.serverId) stmts.push(createTableSql(tt));
  }


  for (const te of (target.enums ?? [])) {
    if (!te.serverId) {
      stmts.push(createEnumSql(te));
    } else {
      const ce = currentEnums.get(te.serverId);
      if (ce) {
        const existing = new Set(ce.values);
        for (const v of te.values) {
          if (!existing.has(v)) {
            stmts.push(`ALTER TYPE ${qn(te.schema, te.name)} ADD VALUE IF NOT EXISTS ${pgLiteral(v)};`);
          }
        }
      }
    }
  }


  for (const tt of target.tables) {
    if (!tt.serverId) continue;
    const ct = currentTables.get(tt.serverId);
    if (!ct) continue;


    if (tt.name !== ct.name) {
      stmts.push(`ALTER TABLE ${qn(ct.schema, ct.name)} RENAME TO ${qi(tt.name)};`);
    }
    if (tt.schema !== ct.schema) {
      stmts.push(`ALTER TABLE ${qn(ct.schema, tt.name)} SET SCHEMA ${qi(tt.schema)};`);
    }

    const qTable = qn(tt.schema, tt.name);
    const currentColMap = new Map(ct.columns.map((c) => [`${ct.schema}.${ct.name}.${c.name}`, c]));


    for (const tc of tt.columns) {
      if (!tc.serverId) continue;
      const cc = currentColMap.get(tc.serverId);
      if (cc && cc.name !== tc.name) {
        stmts.push(`ALTER TABLE ${qTable} RENAME COLUMN ${qi(cc.name)} TO ${qi(tc.name)};`);
      }
    }


    for (const tc of tt.columns) {
      if (!tc.serverId) continue;
      const cc = currentColMap.get(tc.serverId);
      if (!cc) continue;

      const collationChg = (tc.collation ?? null) !== (cc.collation ?? null);
      if (typeChanged(tc, cc) || collationChg) {
        const collateStr = tc.collation ? ` COLLATE "${tc.collation}"` : "";
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} TYPE ${renderPgType(tc.type)}${collateStr};`);
      }

      if (tc.notNull && !cc.not_null) {
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} SET NOT NULL;`);
      } else if (!tc.notNull && cc.not_null) {
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} DROP NOT NULL;`);
      }

      if (tc.defaultExpr !== null && tc.defaultExpr !== (cc.default_value ?? null)) {
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} SET DEFAULT ${tc.defaultExpr};`);
      } else if (tc.defaultExpr === null && cc.default_value !== null && !tc.identity) {
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} DROP DEFAULT;`);
      }

      if (tc.identity !== null && !cc.is_identity) {

        if (cc.default_value !== null) {
          stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} DROP DEFAULT;`);
        }
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} ADD GENERATED ${tc.identity.generation} AS IDENTITY;`);
      } else if (tc.identity === null && cc.is_identity) {
        stmts.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qi(tc.name)} DROP IDENTITY IF EXISTS;`);
      }
    }


    for (const tc of tt.columns) {
      if (tc.serverId) continue;
      stmts.push(`ALTER TABLE ${qTable} ADD COLUMN ${columnDef(tc)};`);
    }


    if (tt.primaryKey && tt.primaryKey.columns.length > 0) {
      const existingPk = ct.constraints.find((c) => c.kind === "p");
      if (!existingPk || tt.primaryKey.columns.join(",") !== existingPk.columns.join(",")) {
        if (existingPk) stmts.push(`ALTER TABLE ${qTable} DROP CONSTRAINT IF EXISTS ${qi(existingPk.name)};`);
        const name = tt.primaryKey.name ? `CONSTRAINT ${qi(tt.primaryKey.name)} ` : "";
        stmts.push(`ALTER TABLE ${qTable} ADD ${name}PRIMARY KEY (${tt.primaryKey.columns.map(qi).join(", ")});`);
      }
    }

    for (const u of tt.uniques) {
      const existing = ct.constraints.find((c) => c.kind === "u" && c.name === u.name);
      if (!existing) {
        const name = u.name ? `CONSTRAINT ${qi(u.name)} ` : "";
        stmts.push(`ALTER TABLE ${qTable} ADD ${name}UNIQUE (${u.columns.map(qi).join(", ")});`);
      } else if (
        existing.columns.length !== u.columns.length ||
        !u.columns.every((c, i) => c === existing.columns[i])
      ) {
        stmts.push(`ALTER TABLE ${qTable} DROP CONSTRAINT IF EXISTS ${qi(existing.name)};`);
        const name = u.name ? `CONSTRAINT ${qi(u.name)} ` : "";
        stmts.push(`ALTER TABLE ${qTable} ADD ${name}UNIQUE (${u.columns.map(qi).join(", ")});`);
      }
    }

    for (const ch of tt.checks) {
      const existing = ct.constraints.find((c) => c.kind === "c" && c.name === ch.name);
      if (!existing) {
        const name = ch.name ? `CONSTRAINT ${qi(ch.name)} ` : "";
        stmts.push(`ALTER TABLE ${qTable} ADD ${name}CHECK (${ch.expr});`);
      } else if (existing.check_expr !== ch.expr) {
        stmts.push(`ALTER TABLE ${qTable} DROP CONSTRAINT IF EXISTS ${qi(existing.name)};`);
        const name = ch.name ? `CONSTRAINT ${qi(ch.name)} ` : "";
        stmts.push(`ALTER TABLE ${qTable} ADD ${name}CHECK (${ch.expr});`);
      }
    }


    for (const tc of tt.columns) {
      if (!tc.fk || !tc.serverId) continue;
      const cc = currentColMap.get(tc.serverId);
      if (!cc) continue;
      const existingFkCon = ct.constraints.find((c) => c.kind === "f" && c.columns[0] === cc.name);
      const fkDef = `ALTER TABLE ${qTable} ADD FOREIGN KEY (${qi(tc.name)}) REFERENCES ${qn(tc.fk.schema, tc.fk.table)}(${qi(tc.fk.column)}) ON UPDATE ${tc.fk.onUpdate} ON DELETE ${tc.fk.onDelete}${tc.fk.deferrable ? " DEFERRABLE" + (tc.fk.initiallyDeferred ? " INITIALLY DEFERRED" : "") : ""};`;
      if (!existingFkCon) {
        stmts.push(fkDef);
      } else {
        const changed =
          existingFkCon.fk_ref_schema !== tc.fk.schema ||
          existingFkCon.fk_ref_table !== tc.fk.table ||
          (existingFkCon.fk_ref_columns?.[0] ?? "") !== tc.fk.column ||
          (existingFkCon.fk_on_delete ?? "NO ACTION") !== tc.fk.onDelete ||
          (existingFkCon.fk_on_update ?? "NO ACTION") !== tc.fk.onUpdate ||
          existingFkCon.deferrable !== tc.fk.deferrable ||
          existingFkCon.initially_deferred !== tc.fk.initiallyDeferred;
        if (changed) {
          stmts.push(`ALTER TABLE ${qTable} DROP CONSTRAINT IF EXISTS ${qi(existingFkCon.name)};`);
          stmts.push(fkDef);
        }
      }
    }
  }


  const currentIndexMap = new Map<string, PgIndexFullInfo>();
  for (const t of current.tables) {
    for (const ix of t.indexes) {
      if (!ix.is_primary && !ix.is_unique_constraint) {
        currentIndexMap.set(`${t.schema}.${ix.name}`, ix);
      }
    }
  }
  for (const ix of target.indexes) {
    if (!ix.serverId) {
      stmts.push(createIndexSql(ix));
      continue;
    }
    const existing = currentIndexMap.get(ix.serverId);
    if (!existing) { stmts.push(createIndexSql(ix)); continue; }

    const colsChanged =
      existing.columns.length !== ix.columns.length ||
      existing.columns.some((ec, i) => {
        const tc = ix.columns[i];
        return ec.expr !== tc.expr || ec.direction !== tc.direction || ec.nulls !== tc.nulls;
      });
    const whereChanged = (existing.where_clause ?? null) !== (ix.whereClause ?? null);
    const methodChanged = existing.method.toLowerCase() !== ix.method.toLowerCase();
    const uniqueChanged = existing.unique !== ix.unique;

    if (colsChanged || whereChanged || methodChanged || uniqueChanged) {
      const [ixSchema] = ix.serverId.split(".");
      stmts.push(`DROP INDEX IF EXISTS ${qn(ixSchema, existing.name)};`);
      stmts.push(createIndexSql(ix));
    }
  }


  for (const f of target.functions) {
    stmts.push(createFunctionSql(f));
  }


  for (const v of target.views) {
    if (!v.serverId) {
      stmts.push(createViewSql(v));
      continue;
    }
    const existing = current.views.find((x) => `${x.schema}.${x.name}` === v.serverId);
    if (!existing) { stmts.push(createViewSql(v)); continue; }

    const sqlChanged = v.sql.trim().replace(/;$/, "") !== existing.definition.trim().replace(/;$/, "");
    const matChanged = v.materialized !== existing.materialized;
    if (!sqlChanged && !matChanged) continue;

    if (existing.materialized) {

      stmts.push(`DROP MATERIALIZED VIEW IF EXISTS ${qn(v.schema, v.name)};`);
      stmts.push(createViewSql(v));
    } else if (v.materialized) {

      stmts.push(`DROP VIEW IF EXISTS ${qn(v.schema, v.name)};`);
      stmts.push(createViewSql(v));
    } else {

      stmts.push(createViewSql(v));
    }
  }


  for (const tr of target.triggers) {
    const fn = target.functions.find((f) => f.id === tr.functionId);
    if (!fn) continue;
    const tKey = `${tr.schema}.${tr.name}`;
    if (current.triggers.find((x) => `${x.schema}.${x.name}` === tKey)) {
      stmts.push(`DROP TRIGGER IF EXISTS ${qi(tr.name)} ON ${qn(tr.schema, tr.table)};`);
    }
    stmts.push(createTriggerSql(tr, fn.name, fn.schema));
  }


  for (const tt of target.tables) {
    const ct = tt.serverId ? currentTables.get(tt.serverId) : undefined;
    if (tt.comment !== null && tt.comment !== (ct?.comment ?? null)) {
      stmts.push(`COMMENT ON TABLE ${qn(tt.schema, tt.name)} IS ${pgLiteral(tt.comment)};`);
    }
    for (const tc of tt.columns) {
      if (tc.comment !== null) {
        stmts.push(`COMMENT ON COLUMN ${qn(tt.schema, tt.name)}.${qi(tc.name)} IS ${pgLiteral(tc.comment)};`);
      }
    }
  }

  return { sql: stmts.join("\n"), statements: stmts, errors: [], destructive };
}


export function snapshotTableKey(t: PgTableFullInfo): string {
  return `${t.schema}.${t.name}`;
}
