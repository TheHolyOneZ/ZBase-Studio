import type {
  MysqlBuilderDraft, MysqlDraftColumn, MysqlDraftTable, MysqlDraftIndex,
  MysqlDraftView, MysqlDraftTrigger, MysqlDraftRoutine,
  MysqlDraftError, MysqlDraftConstraint,
} from "../types/mysqlBuilder";
import type { MysqlSchemaSnapshot, MysqlColumnInfo, MysqlIndexInfo } from "../types/mysqlSchema";
import type { DestructiveOp } from "../types/builderShared";


function qi(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

function sqlLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function mysqlConstraintAddSql(qTable: string, tc: MysqlDraftConstraint): string {
  if (tc.kind === "UNIQUE") {
    return `ALTER TABLE ${qTable} ADD UNIQUE KEY ${qi(tc.name)} (${tc.columns.map(qi).join(", ")});`;
  } else if (tc.kind === "CHECK") {
    return `ALTER TABLE ${qTable} ADD CONSTRAINT ${qi(tc.name)} CHECK (${tc.checkExpr});`;
  } else {
    const cols = tc.fkColumns.map(qi).join(", ");
    const refCols = tc.fkRefColumns.map(qi).join(", ");
    let fk = `ALTER TABLE ${qTable} ADD CONSTRAINT ${qi(tc.name)} FOREIGN KEY (${cols}) REFERENCES ${qi(tc.fkRefTable)}(${refCols})`;
    if (tc.fkOnDelete !== "NO ACTION") fk += ` ON DELETE ${tc.fkOnDelete}`;
    if (tc.fkOnUpdate !== "NO ACTION") fk += ` ON UPDATE ${tc.fkOnUpdate}`;
    return fk + ";";
  }
}

// ── Type rendering ─────────────────────────────────────────────────────────

export function renderMysqlType(col: MysqlDraftColumn): string {
  const dt = col.dataType.toUpperCase();
  let out = dt;

  switch (dt) {
    case "VARCHAR":
    case "CHAR":
    case "BINARY":
    case "VARBINARY":
      out = col.length != null ? `${dt}(${col.length})` : `${dt}(255)`;
      break;
    case "DECIMAL":
    case "NUMERIC":
      if (col.precision != null && col.scale != null) out = `${dt}(${col.precision},${col.scale})`;
      else if (col.precision != null) out = `${dt}(${col.precision})`;
      break;
    case "FLOAT":
    case "DOUBLE":
      if (col.precision != null) out = `${dt}(${col.precision})`;
      break;
    case "DATETIME":
    case "TIMESTAMP":
    case "TIME":
      if (col.fsp != null && col.fsp > 0) out = `${dt}(${col.fsp})`;
      break;
    case "BIT":
      if (col.length != null) out = `BIT(${col.length})`;
      break;
    case "TINYINT":
      if (col.length === 1) out = "TINYINT(1)";
      break;
    case "ENUM":
      out = `ENUM(${col.enumValues.map(sqlLit).join(", ")})`;
      break;
    case "SET":
      out = `SET(${col.setValues.map(sqlLit).join(", ")})`;
      break;
    case "UUID":
    case "INET4":
    case "INET6":
      // MariaDB-only native types; emitted as-is (UI prevents selecting on MySQL flavor)
      out = dt;
      break;
  }

  if (col.unsigned && !["FLOAT","DOUBLE","DECIMAL","NUMERIC","BIT","YEAR"].includes(dt)) {
    out += " UNSIGNED";
  }
  if (col.zerofill) out += " ZEROFILL";
  return out;
}

// ── Column DDL fragment ────────────────────────────────────────────────────

function columnDef(col: MysqlDraftColumn, flavor: "mysql" | "mariadb"): string {
  const parts: string[] = [qi(col.name), renderMysqlType(col)];

  if (col.collation) parts.push(`COLLATE ${col.collation}`);

  if (col.notNull) parts.push("NOT NULL");
  else parts.push("NULL");

  if (col.generatedExpr) {
    parts.push(`AS (${col.generatedExpr})`);
    parts.push(col.generatedStored ? "STORED" : "VIRTUAL");
  } else {
    if (col.defaultExpr !== null) parts.push(`DEFAULT ${col.defaultExpr}`);
    if (col.autoIncrement) parts.push("AUTO_INCREMENT");
    if (col.onUpdateCurrentTimestamp) parts.push("ON UPDATE CURRENT_TIMESTAMP");
  }
  if (col.invisible && flavor === "mariadb") parts.push("INVISIBLE");
  if (col.comment) parts.push(`COMMENT ${sqlLit(col.comment)}`);
  if (col.check) parts.push(`CHECK (${col.check})`);
  if (col.fk) {
    parts.push(`REFERENCES ${qi(col.fk.refTable)}(${qi(col.fk.refColumn)})`);
    if (col.fk.onDelete !== "NO ACTION") parts.push(`ON DELETE ${col.fk.onDelete}`);
    if (col.fk.onUpdate !== "NO ACTION") parts.push(`ON UPDATE ${col.fk.onUpdate}`);
  }
  return parts.join(" ");
}

// ── CREATE TABLE ──────────────────────────────────────────────────────────

function createTableSql(t: MysqlDraftTable, flavor: "mysql" | "mariadb"): string {
  const lines: string[] = t.columns.map((c) => `  ${columnDef(c, flavor)}`);

  if (t.primaryKey && t.primaryKey.columns.length > 0) {
    lines.push(`  PRIMARY KEY (${t.primaryKey.columns.map(qi).join(", ")})`);
  }

  for (const con of t.constraints) {
    if (con.kind === "UNIQUE") {
      const cols = con.columns.map(qi).join(", ");
      lines.push(`  UNIQUE KEY ${qi(con.name)} (${cols})`);
    } else if (con.kind === "CHECK") {
      lines.push(`  CONSTRAINT ${qi(con.name)} CHECK (${con.checkExpr})`);
    } else if (con.kind === "FOREIGN") {
      const cols = con.fkColumns.map(qi).join(", ");
      const refCols = con.fkRefColumns.map(qi).join(", ");
      let fkLine = `  CONSTRAINT ${qi(con.name)} FOREIGN KEY (${cols}) REFERENCES ${qi(con.fkRefTable)}(${refCols})`;
      if (con.fkOnDelete !== "NO ACTION") fkLine += ` ON DELETE ${con.fkOnDelete}`;
      if (con.fkOnUpdate !== "NO ACTION") fkLine += ` ON UPDATE ${con.fkOnUpdate}`;
      lines.push(fkLine);
    }
  }

  const opts: string[] = [];
  opts.push(`ENGINE=${t.engine}`);
  if (t.charset) opts.push(`DEFAULT CHARSET=${t.charset}`);
  if (t.collate) opts.push(`COLLATE=${t.collate}`);
  if (t.rowFormat) opts.push(`ROW_FORMAT=${t.rowFormat}`);
  if (t.autoIncrementStart != null) opts.push(`AUTO_INCREMENT=${t.autoIncrementStart}`);
  if (t.comment) opts.push(`COMMENT=${sqlLit(t.comment)}`);

  const sysVer = flavor === "mariadb" && t.systemVersioned ? " WITH SYSTEM VERSIONING" : "";
  return `CREATE TABLE ${qi(t.schema)}.${qi(t.name)} (\n${lines.join(",\n")}\n) ${opts.join(" ")}${sysVer};`;
}

// ── CREATE INDEX ──────────────────────────────────────────────────────────

function createIndexSql(ix: MysqlDraftIndex): string {
  const cols = ix.columns.map((c) => {
    const base = c.expression
      ? `(${c.expression})`
      : `${qi(c.columnName)}${c.prefixLength != null ? `(${c.prefixLength})` : ""}`;
    return `${base} ${c.direction}`;
  }).join(", ");

  if (ix.method === "FULLTEXT") {
    return `CREATE FULLTEXT INDEX ${qi(ix.name)} ON ${qi(ix.table)} (${cols});`;
  }
  if (ix.method === "SPATIAL") {
    return `CREATE SPATIAL INDEX ${qi(ix.name)} ON ${qi(ix.table)} (${cols});`;
  }
  const unique = ix.unique ? "UNIQUE " : "";
  const using = ix.method !== "BTREE" ? ` USING ${ix.method}` : "";
  return `CREATE ${unique}INDEX ${qi(ix.name)} ON ${qi(ix.table)}${using} (${cols});`;
}

// ── CREATE VIEW ───────────────────────────────────────────────────────────

function createViewSql(v: MysqlDraftView): string {
  return `CREATE OR REPLACE VIEW ${qi(v.schema)}.${qi(v.name)} AS\n${v.body};`;
}

// ── CREATE TRIGGER ────────────────────────────────────────────────────────

function createTriggerSql(tr: MysqlDraftTrigger): string {
  return `CREATE TRIGGER ${qi(tr.name)}\n  ${tr.timing} ${tr.event} ON ${qi(tr.table)}\n  FOR EACH ROW\n${tr.body};`;
}

// ── CREATE ROUTINE ────────────────────────────────────────────────────────

function createRoutineSql(r: MysqlDraftRoutine): string {
  const det = r.deterministic ? "DETERMINISTIC" : "NOT DETERMINISTIC";
  const sec = `SQL SECURITY ${r.sqlSecurity}`;
  if (r.kind === "FUNCTION") {
    const ret = r.returns ?? "VARCHAR(255)";
    return `CREATE OR REPLACE FUNCTION ${qi(r.schema)}.${qi(r.name)}(${r.parameters})\nRETURNS ${ret}\n${det}\n${r.dataAccess}\n${sec}\n${r.body};`;
  }
  return `CREATE OR REPLACE PROCEDURE ${qi(r.schema)}.${qi(r.name)}(${r.parameters})\n${det}\n${r.dataAccess}\n${sec}\n${r.body};`;
}

// ── Validation ────────────────────────────────────────────────────────────

export function validateMysqlDraft(draft: MysqlBuilderDraft): MysqlDraftError[] {
  const errors: MysqlDraftError[] = [];
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
    let autoIncCount = 0;
    const colNames = new Set<string>();
    for (const c of t.columns) {
      if (!c.name.trim()) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: "Column name is required" });
      } else if (colNames.has(c.name)) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `Duplicate column: ${c.name}` });
      } else {
        colNames.add(c.name);
      }
      if (c.autoIncrement) autoIncCount++;
      if (c.dataType === "ENUM" && c.enumValues.length === 0) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `ENUM column "${c.name}" must have at least one value` });
      }
      if (c.dataType === "SET" && c.setValues.length === 0) {
        errors.push({ kind: "column", objectId: t.id, columnId: c.id, message: `SET column "${c.name}" must have at least one value` });
      }
    }
    if (autoIncCount > 1) {
      errors.push({ kind: "table", objectId: t.id, message: `Table "${t.name}" can only have one AUTO_INCREMENT column` });
    }
  }

  for (const ix of draft.indexes) {
    if (!ix.name.trim()) errors.push({ kind: "index", objectId: ix.id, message: "Index name is required" });
    if (!ix.table.trim()) errors.push({ kind: "index", objectId: ix.id, message: "Index must reference a table" });
    if (ix.columns.length === 0) errors.push({ kind: "index", objectId: ix.id, message: `Index "${ix.name}" must have at least one column` });
    for (const c of ix.columns) {
      if (!c.expression && !c.columnName.trim()) {
        errors.push({ kind: "index", objectId: ix.id, message: `Index "${ix.name}" has a column row with no column or expression` });
      }
    }
  }

  for (const v of draft.views) {
    if (!v.name.trim()) errors.push({ kind: "view", objectId: v.id, message: "View name is required" });
    if (!v.body.trim()) errors.push({ kind: "view", objectId: v.id, message: `View "${v.name}" must have a body` });
  }

  for (const tr of draft.triggers) {
    if (!tr.name.trim()) errors.push({ kind: "trigger", objectId: tr.id, message: "Trigger name is required" });
    if (!tr.table.trim()) errors.push({ kind: "trigger", objectId: tr.id, message: "Trigger must reference a table" });
  }

  for (const r of draft.routines) {
    if (!r.name.trim()) errors.push({ kind: "routine", objectId: r.id, message: "Routine name is required" });
    if (r.kind === "FUNCTION" && !r.returns?.trim()) {
      errors.push({ kind: "routine", objectId: r.id, message: `Function "${r.name}" must specify a return type` });
    }
  }

  return errors;
}

// ── buildMysqlCreateDdl ───────────────────────────────────────────────────

export function buildMysqlCreateDdl(draft: MysqlBuilderDraft): { sql: string; statements: string[]; errors: MysqlDraftError[] } {
  const errors = validateMysqlDraft(draft);
  if (errors.length > 0) return { sql: "", statements: [], errors };

  const stmts: string[] = [];
  for (const t of draft.tables) stmts.push(createTableSql(t, draft.flavor));
  for (const ix of draft.indexes) stmts.push(createIndexSql(ix));
  for (const r of draft.routines) stmts.push(createRoutineSql(r));
  for (const v of draft.views) stmts.push(createViewSql(v));
  for (const tr of draft.triggers) stmts.push(createTriggerSql(tr));

  return { sql: stmts.join("\n\n"), statements: stmts, errors: [] };
}

// ── Column type comparison helpers ────────────────────────────────────────

function columnTypeChanged(tc: MysqlDraftColumn, cc: MysqlColumnInfo): boolean {
  const dt = tc.dataType.toUpperCase();
  const sdt = cc.data_type.toUpperCase();
  if (dt !== sdt) return true;
  if (tc.length !== (cc.character_max_length ?? null)) return true;
  if (tc.precision !== (cc.numeric_precision ?? null)) return true;
  if (tc.scale !== (cc.numeric_scale ?? null)) return true;
  if (tc.fsp !== (cc.datetime_precision ?? null)) return true;
  if (tc.unsigned !== cc.unsigned) return true;
  if (tc.zerofill !== cc.zerofill) return true;
  if (dt === "ENUM" && tc.enumValues.join(",") !== cc.enum_values.join(",")) return true;
  if (dt === "SET" && tc.setValues.join(",") !== cc.set_values.join(",")) return true;
  return false;
}

function isTypeNarrowing(tc: MysqlDraftColumn, cc: MysqlColumnInfo): boolean {
  if (columnTypeChanged(tc, cc)) {
    const dt = tc.dataType.toUpperCase();
    const sdt = cc.data_type.toUpperCase();
    if (dt !== sdt) return true; // type change is always potentially destructive
    if (tc.length != null && cc.character_max_length != null && tc.length < cc.character_max_length) return true;
    if (tc.precision != null && cc.numeric_precision != null && tc.precision < cc.numeric_precision) return true;
    if (!tc.unsigned && cc.unsigned) return true; // unsigned→signed can overflow
    if (dt === "ENUM") {
      const removed = cc.enum_values.filter((v) => !tc.enumValues.includes(v));
      if (removed.length > 0) return true;
    }
    if (dt === "SET") {
      const removed = cc.set_values.filter((v) => !tc.setValues.includes(v));
      if (removed.length > 0) return true;
    }
  }
  return false;
}

// ── diffMysqlDraft ────────────────────────────────────────────────────────

export function diffMysqlDraft(
  current: MysqlSchemaSnapshot,
  target: MysqlBuilderDraft,
): { sql: string; statements: string[]; errors: MysqlDraftError[]; destructive: DestructiveOp[] } {
  const errors = validateMysqlDraft(target);
  if (errors.length > 0) return { sql: "", statements: [], errors, destructive: [] };

  const stmts: string[] = [];
  const destructive: DestructiveOp[] = [];

  const db = target.currentDatabase;
  const currentTables = new Map(current.tables.map((t) => [`${t.schema}.${t.name}`, t]));

  // 1. DROP triggers no longer in target
  for (const ctr of current.triggers) {
    const key = `${ctr.schema}.${ctr.name}`;
    if (!target.triggers.find((x) => x.serverId === key)) {
      stmts.push(`DROP TRIGGER IF EXISTS ${qi(db)}.${qi(ctr.name)};`);
      destructive.push({ kind: "drop_trigger", objectName: key, message: `Trigger "${ctr.name}" will be dropped` });
    }
  }

  // 2. DROP views no longer in target
  for (const cv of current.views) {
    const key = `${cv.schema}.${cv.name}`;
    if (!target.views.find((x) => x.serverId === key)) {
      stmts.push(`DROP VIEW IF EXISTS ${qi(cv.schema)}.${qi(cv.name)};`);
      destructive.push({ kind: "drop_view", objectName: key, message: `View "${cv.name}" will be dropped` });
    }
  }

  // 3. DROP routines no longer in target
  for (const cr of current.routines) {
    const key = `${cr.schema}.${cr.name}`;
    if (!target.routines.find((x) => x.serverId === key)) {
      const kw = cr.routine_type === "FUNCTION" ? "FUNCTION" : "PROCEDURE";
      stmts.push(`DROP ${kw} IF EXISTS ${qi(cr.schema)}.${qi(cr.name)};`);
      destructive.push({ kind: "drop_routine", objectName: key, message: `${cr.routine_type} "${cr.name}" will be dropped` });
    }
  }

  // 4. DROP indexes no longer in target (for tables that still exist)
  for (const ct of current.tables) {
    const tKey = `${ct.schema}.${ct.name}`;
    if (!target.tables.find((tt) => tt.serverId === tKey)) continue;
    for (const cix of ct.indexes) {
      if (cix.is_primary) continue;
      const ixKey = `${ct.schema}.${ct.name}.${cix.name}`;
      const stillPresent = target.indexes.find((x) => x.serverId === ixKey);
      const inConstraints = target.tables.find((tt) => tt.serverId === tKey)
        ?.constraints.find((c) => c.kind === "UNIQUE" && c.serverId === ixKey);
      if (!stillPresent && !inConstraints) {
        stmts.push(`DROP INDEX ${qi(cix.name)} ON ${qi(ct.schema)}.${qi(ct.name)};`);
        destructive.push({ kind: "drop_index", objectName: ixKey, message: `Index "${cix.name}" on "${ct.name}" will be dropped` });
      }
    }
  }

  // 5. DROP constraints on tables that still exist
  for (const ct of current.tables) {
    const tKey = `${ct.schema}.${ct.name}`;
    const tt = target.tables.find((x) => x.serverId === tKey);
    if (!tt) continue;

    for (const cc of ct.constraints) {
      const cKey = `${ct.schema}.${ct.name}.${cc.name}`;
      if (cc.kind === "PRIMARY") continue;

      if (cc.kind === "FOREIGN") {
        const stillPresent = tt.constraints.find((c) => c.kind === "FOREIGN" && c.serverId === cKey);
        if (!stillPresent) {
          stmts.push(`ALTER TABLE ${qi(ct.schema)}.${qi(ct.name)} DROP FOREIGN KEY ${qi(cc.name)};`);
          destructive.push({ kind: "drop_constraint", objectName: cc.name, message: `FK "${cc.name}" will be dropped` });
        }
        continue;
      }

      if (cc.kind === "UNIQUE") {
        const stillPresent = tt.constraints.find((c) => c.kind === "UNIQUE" && c.serverId === cKey);
        if (!stillPresent) {
          stmts.push(`ALTER TABLE ${qi(ct.schema)}.${qi(ct.name)} DROP INDEX ${qi(cc.name)};`);
        }
        continue;
      }

      if (cc.kind === "CHECK") {
        const stillPresent = tt.constraints.find((c) => c.kind === "CHECK" && c.serverId === cKey);
        if (!stillPresent) {
          stmts.push(`ALTER TABLE ${qi(ct.schema)}.${qi(ct.name)} DROP CHECK ${qi(cc.name)};`);
        }
      }
    }
  }

  // 6. DROP columns on tables that still exist
  for (const ct of current.tables) {
    const tKey = `${ct.schema}.${ct.name}`;
    const tt = target.tables.find((x) => x.serverId === tKey);
    if (!tt) continue;

    for (const cc of ct.columns) {
      const cSrvId = `${ct.schema}.${ct.name}.${cc.name}`;
      if (!tt.columns.find((c) => c.serverId === cSrvId)) {
        stmts.push(`ALTER TABLE ${qi(ct.schema)}.${qi(ct.name)} DROP COLUMN ${qi(cc.name)};`);
        destructive.push({ kind: "drop_column", objectName: `${ct.name}.${cc.name}`, message: `Column "${cc.name}" will be dropped from "${ct.name}"` });
      }
    }
  }

  // 7. DROP tables no longer in target
  for (const [srvKey, ct] of currentTables) {
    if (!target.tables.find((tt) => tt.serverId === srvKey)) {
      stmts.push(`DROP TABLE IF EXISTS ${qi(ct.schema)}.${qi(ct.name)};`);
      destructive.push({ kind: "drop_table", objectName: srvKey, message: `Table "${ct.name}" will be dropped` });
    }
  }

  // 8. CREATE new tables
  for (const tt of target.tables) {
    if (!tt.serverId) stmts.push(createTableSql(tt, target.flavor));
  }

  // 9. Alter existing tables
  for (const tt of target.tables) {
    if (!tt.serverId) continue;
    const ct = currentTables.get(tt.serverId);
    if (!ct) continue;

    // RENAME TABLE
    if (tt.name !== ct.name) {
      stmts.push(`RENAME TABLE ${qi(ct.schema)}.${qi(ct.name)} TO ${qi(tt.schema)}.${qi(tt.name)};`);
    }

    const qTable = `${qi(tt.schema)}.${qi(tt.name)}`;
    const currentColMap = new Map(ct.columns.map((c) => [`${ct.schema}.${ct.name}.${c.name}`, c]));

    // RENAME columns (emit before MODIFY so subsequent refs use the new name)
    for (const tc of tt.columns) {
      if (!tc.serverId) continue;
      const cc = currentColMap.get(tc.serverId);
      if (!cc || cc.name === tc.name) continue;
      stmts.push(`ALTER TABLE ${qTable} RENAME COLUMN ${qi(cc.name)} TO ${qi(tc.name)};`);
    }

    // Detect column reorder: compare draft array order (server-mapped only) vs snapshot ordinal order
    const serverColsInSnapshotOrder = [...ct.columns]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((c) => `${ct.schema}.${ct.name}.${c.name}`);
    const targetServerOrder = tt.columns
      .filter((c) => c.serverId)
      .map((c) => c.serverId!);
    const reordered = new Set<string>();
    for (let i = 0; i < targetServerOrder.length; i++) {
      if (targetServerOrder[i] !== serverColsInSnapshotOrder[i]) {
        reordered.add(targetServerOrder[i]);
      }
    }

    // MODIFY existing columns
    for (const tc of tt.columns) {
      if (!tc.serverId) continue;
      const cc = currentColMap.get(tc.serverId);
      if (!cc) continue;

      const typeChg = columnTypeChanged(tc, cc);
      const notNullChg = tc.notNull !== !cc.nullable;
      const defaultChg = tc.defaultExpr !== (cc.default_value ?? null);
      const aiChg = tc.autoIncrement !== cc.auto_increment;
      const onUpdChg = tc.onUpdateCurrentTimestamp !== cc.on_update_current_timestamp;
      const commentChg = tc.comment !== cc.comment;
      const invisibleChg = tc.invisible !== cc.invisible;
      const collationChg = tc.collation !== (cc.collation ?? null);
      const ccCheck = ct.constraints.find(
        (c) => c.kind === "CHECK" && c.columns.length === 1 && c.columns[0] === cc.name
      )?.check_expr ?? null;
      const checkChg = tc.check !== ccCheck;
      const positionChg = reordered.has(tc.serverId);
      const generatedExprChg =
        tc.generatedExpr !== (cc.generated_expression ?? null) ||
        (tc.generatedExpr !== null && tc.generatedStored !== cc.generated_stored);

      if (typeChg || notNullChg || defaultChg || aiChg || onUpdChg || commentChg || invisibleChg || collationChg || checkChg || positionChg || generatedExprChg) {
        if (isTypeNarrowing(tc, cc)) {
          destructive.push({ kind: "type_narrow", objectName: `${ct.name}.${cc.name}`, message: `Column "${cc.name}" type change may lose data` });
        }
        const newIdx = tt.columns.findIndex((c) => c.id === tc.id);
        const afterClause = positionChg
          ? (newIdx === 0 ? " FIRST" : ` AFTER ${qi(tt.columns[newIdx - 1].name)}`)
          : "";
        stmts.push(`ALTER TABLE ${qTable} MODIFY COLUMN ${columnDef(tc, target.flavor)}${afterClause};`);
      }
    }

    // ADD new columns (with AFTER/FIRST for correct position)
    for (let i = 0; i < tt.columns.length; i++) {
      const tc = tt.columns[i];
      if (tc.serverId) continue;
      const afterClause = i === 0
        ? " FIRST"
        : ` AFTER ${qi(tt.columns[i - 1].name)}`;
      stmts.push(`ALTER TABLE ${qTable} ADD COLUMN ${columnDef(tc, target.flavor)}${afterClause};`);
    }

    // PRIMARY KEY changes
    const currentPk = ct.constraints.find((c) => c.kind === "PRIMARY");
    const currentPkCols = currentPk?.columns ?? [];
    const targetPkCols = tt.primaryKey?.columns ?? [];
    const pkChanged = targetPkCols.join(",") !== currentPkCols.join(",");
    if (pkChanged) {
      if (currentPkCols.length > 0) {
        // MySQL requires AUTO_INCREMENT to be stripped before DROP PRIMARY KEY.
        // If a column leaving the PK still has AI (and we haven't already MODIFY'd it
        // to remove AI), emit an extra MODIFY to strip it first.
        for (const colName of currentPkCols) {
          if (targetPkCols.includes(colName)) continue; // staying in PK, no issue
          const cc2 = ct.columns.find((c) => c.name === colName);
          if (!cc2?.auto_increment) continue;
          const tc2 = tt.columns.find((c) => {
            const mapped = currentColMap.get(c.serverId ?? "");
            return mapped?.name === colName;
          });
          // Only emit if no MODIFY was already emitted for this column's AI flag
          if (tc2 && tc2.autoIncrement) {
            stmts.push(`ALTER TABLE ${qTable} MODIFY COLUMN ${columnDef({ ...tc2, autoIncrement: false }, target.flavor)};`);
          }
        }
        stmts.push(`ALTER TABLE ${qTable} DROP PRIMARY KEY;`);
      }
      if (targetPkCols.length > 0) {
        stmts.push(`ALTER TABLE ${qTable} ADD PRIMARY KEY (${targetPkCols.map(qi).join(", ")});`);
      }
    }


    for (const tc of tt.constraints) {
      if (!tc.serverId) continue;
      const cc = ct.constraints.find((c) => `${ct.schema}.${ct.name}.${c.name}` === tc.serverId);
      if (!cc) continue;

      let changed = false;
      if (tc.kind === "CHECK") {
        changed = tc.checkExpr !== (cc.check_expr ?? "");
      } else if (tc.kind === "UNIQUE") {
        changed = tc.name !== cc.name || !sameStringArray(tc.columns, cc.columns);
      } else if (tc.kind === "FOREIGN") {
        changed =
          tc.name !== cc.name ||
          !sameStringArray(tc.fkColumns, cc.columns) ||
          tc.fkRefTable !== (cc.fk_ref_table ?? "") ||
          !sameStringArray(tc.fkRefColumns, cc.fk_ref_columns) ||
          (tc.fkOnDelete ?? "NO ACTION") !== (cc.fk_on_delete ?? "NO ACTION") ||
          (tc.fkOnUpdate ?? "NO ACTION") !== (cc.fk_on_update ?? "NO ACTION");
      }
      if (!changed) continue;

      if (cc.kind === "CHECK") stmts.push(`ALTER TABLE ${qTable} DROP CHECK ${qi(cc.name)};`);
      else if (cc.kind === "FOREIGN") stmts.push(`ALTER TABLE ${qTable} DROP FOREIGN KEY ${qi(cc.name)};`);
      else if (cc.kind === "UNIQUE") stmts.push(`ALTER TABLE ${qTable} DROP INDEX ${qi(cc.name)};`);

      stmts.push(mysqlConstraintAddSql(qTable, tc));
    }


    for (const tc of tt.constraints) {
      if (tc.serverId) continue;
      stmts.push(mysqlConstraintAddSql(qTable, tc));
    }


    if (tt.engine && ct.engine && tt.engine !== ct.engine) {
      stmts.push(`ALTER TABLE ${qTable} ENGINE = ${tt.engine};`);
      destructive.push({ kind: "drop_table", objectName: `${ct.name}[engine]`, message: `ENGINE change on "${ct.name}" rewrites the table` });
    }


    if (tt.charset && ct.charset && tt.charset !== ct.charset) {
      stmts.push(`ALTER TABLE ${qTable} CONVERT TO CHARACTER SET ${tt.charset} COLLATE ${tt.collate || tt.charset + "_general_ci"};`);
      destructive.push({ kind: "drop_column", objectName: `${ct.name}[charset]`, message: `Character set change on "${ct.name}" rewrites all text data` });
    }


    if (tt.rowFormat) {
      stmts.push(`ALTER TABLE ${qTable} ROW_FORMAT = ${tt.rowFormat};`);
    }


    if (tt.comment !== ct.comment) {
      stmts.push(`ALTER TABLE ${qTable} COMMENT = ${sqlLit(tt.comment)};`);
    }


    if (tt.autoIncrementStart != null && tt.autoIncrementStart !== (ct.auto_increment ?? null)) {
      stmts.push(`ALTER TABLE ${qTable} AUTO_INCREMENT = ${tt.autoIncrementStart};`);
    }


    if (target.flavor === "mariadb" && tt.systemVersioned !== ct.system_versioned) {
      if (tt.systemVersioned) {
        stmts.push(`ALTER TABLE ${qTable} ADD SYSTEM VERSIONING;`);
      } else {
        stmts.push(`ALTER TABLE ${qTable} DROP SYSTEM VERSIONING;`);
        destructive.push({ kind: "drop_column", objectName: `${ct.name}[system_versioning]`, message: `Removing system versioning from "${ct.name}" drops all row history` });
      }
    }
  }


  const currentIxMap = new Map<string, MysqlIndexInfo & { schema: string; tableName: string }>();
  for (const t of current.tables)
    for (const ix of t.indexes)
      currentIxMap.set(`${t.schema}.${t.name}.${ix.name}`, { ...ix, schema: t.schema, tableName: t.name });

  for (const ix of target.indexes) {
    if (!ix.serverId) { stmts.push(createIndexSql(ix)); continue; }
    const existing = currentIxMap.get(ix.serverId);
    if (!existing) { stmts.push(createIndexSql(ix)); continue; }
    const changed =
      ix.method.toUpperCase() !== existing.index_type.toUpperCase() ||
      ix.unique !== existing.unique ||
      ix.columns.length !== existing.columns.length ||
      ix.columns.some((c, i) => {
        const ec = existing.columns[i];
        return (c.expression ? "" : c.columnName) !== ec.column_name
          || (c.prefixLength ?? null) !== (ec.sub_part ?? null)
          || (c.direction === "ASC") !== ec.asc
          || (c.expression ?? null) !== (ec.expression ?? null);
      });
    if (changed) {
      stmts.push(`DROP INDEX ${qi(ix.name)} ON ${qi(existing.schema)}.${qi(existing.tableName)};`);
      stmts.push(createIndexSql(ix));
    }
  }


  for (const r of target.routines) {
    if (!r.serverId) {
      stmts.push(createRoutineSql(r));
      continue;
    }
    const existing = current.routines.find((x) => `${x.schema}.${x.name}` === r.serverId);
    if (!existing) { stmts.push(createRoutineSql(r)); continue; }
    const changed =
      r.body.trim() !== existing.body.trim() ||
      r.kind !== existing.routine_type ||
      r.deterministic !== existing.deterministic ||
      r.dataAccess !== existing.data_access ||
      r.sqlSecurity !== existing.security_type;
    if (changed) stmts.push(createRoutineSql(r));
  }


  for (const v of target.views) {
    if (!v.serverId) {
      stmts.push(createViewSql(v));
      continue;
    }
    const existing = current.views.find((x) => `${x.schema}.${x.name}` === v.serverId);
    if (!existing) { stmts.push(createViewSql(v)); continue; }
    if (v.body.trim().replace(/;$/, "") !== existing.definition.trim().replace(/;$/, "")) {
      stmts.push(createViewSql(v));
    }
  }


  for (const tr of target.triggers) {
    const key = `${tr.schema}.${tr.name}`;
    const existing = current.triggers.find((x) => `${x.schema}.${x.name}` === key);
    if (!existing) {
      stmts.push(createTriggerSql(tr));
      continue;
    }
    const changed =
      !tr.serverId ||
      tr.body.trim() !== existing.statement.trim() ||
      tr.timing.toUpperCase() !== existing.timing.toUpperCase() ||
      tr.event.toUpperCase() !== existing.event.toUpperCase() ||
      tr.table !== existing.table_name;
    if (changed) {
      stmts.push(`DROP TRIGGER IF EXISTS ${qi(db)}.${qi(tr.name)};`);
      stmts.push(createTriggerSql(tr));
    }
  }

  return { sql: stmts.join("\n"), statements: stmts, errors: [], destructive };
}
