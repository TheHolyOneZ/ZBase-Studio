import type { SchemaPlan } from "./schemaDiff";

export interface SqlPlan {
  statements: string[];
  requiresFkOff: boolean;
  rebuiltTables: string[];
}

function esc(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const TMP_PREFIX = "__er_rebuild_tmp_";

function rebuildStatements(
  name: string,
  createSql: string,
  commonCols: string[],
): string[] {
  const tmpName = `${TMP_PREFIX}${name}`;
  const stmts: string[] = [];

  // Replace the table name in the CREATE TABLE DDL with the tmp name.
  // buildDdl generates: CREATE TABLE "name" (...)
  // We match the quoted name after CREATE TABLE (may contain "" for embedded quotes).
  const tmpCreate = createSql.replace(
    /^(CREATE\s+TABLE\s+)"((?:[^"]|"")*)"/i,
    (_m, prefix) => `${prefix}${esc(tmpName)}`,
  );

  stmts.push(tmpCreate);

  if (commonCols.length > 0) {
    const colList = commonCols.map(esc).join(", ");
    stmts.push(
      `INSERT INTO ${esc(tmpName)} (${colList}) SELECT ${colList} FROM ${esc(name)};`,
    );
  }

  stmts.push(`DROP TABLE ${esc(name)};`);
  stmts.push(`ALTER TABLE ${esc(tmpName)} RENAME TO ${esc(name)};`);

  return stmts;
}

export function planToStatements(plan: SchemaPlan): SqlPlan {
  const statements: string[] = [];
  const rebuiltTables: string[] = [];

  for (const op of plan.ops) {
    switch (op.kind) {
      case "drop_index":
        statements.push(`DROP INDEX IF EXISTS ${esc(op.name)};`);
        break;
      case "drop_table":
        statements.push(`DROP TABLE IF EXISTS ${esc(op.name)};`);
        break;
      case "create_table":
        statements.push(op.createSql);
        break;
      case "add_column":
        statements.push(`ALTER TABLE ${esc(op.table)} ADD COLUMN ${op.colSql};`);
        break;
      case "rebuild_table":
        statements.push(...rebuildStatements(op.name, op.createSql, op.commonCols));
        rebuiltTables.push(op.name);
        break;
      case "create_index":
        statements.push(op.createSql);
        break;
    }
  }

  return { statements, requiresFkOff: plan.requiresFkOff, rebuiltTables };
}
