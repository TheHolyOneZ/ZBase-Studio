use crate::db::pg_introspect::get_pg_schema_full;
use crate::error::Result;
use crate::scan::export::ExportProgress;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Instant;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PgDbExportOptions {
    pub include_structure: bool,
    pub include_data: bool,
    pub include_views: bool,
    pub include_functions: bool,
    pub include_triggers: bool,
    pub include_enums: bool,
    pub drop_objects: bool,
    pub if_not_exists: bool,
    pub disable_triggers: bool,
    pub wrap_transaction: bool,
    pub insert_mode: String,
    pub batch_size: usize,
    pub add_comments: bool,
}

impl Default for PgDbExportOptions {
    fn default() -> Self {
        Self {
            include_structure: true,
            include_data: true,
            include_views: true,
            include_functions: true,
            include_triggers: true,
            include_enums: true,
            drop_objects: true,
            if_not_exists: false,
            disable_triggers: false,
            wrap_transaction: true,
            insert_mode: "insert".to_string(),
            batch_size: 500,
            add_comments: true,
        }
    }
}

pub fn run_pg_export_database<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<sqlx::PgPool>,
    job_id: String,
    path: String,
    opts: PgDbExportOptions,
    cancel: Arc<AtomicBool>,
) {
    tokio::spawn(async move {
        match do_pg_export_database(&app, &pool, &job_id, &path, &opts, &cancel).await {
            Err(e) => {
                let _ = app.emit(&format!("export://error/{job_id}"), e.to_string());
            }
            Ok(n) => {
                let _ = app.emit(
                    &format!("export://progress/{job_id}"),
                    ExportProgress { written: n, total_estimate: n },
                );
                let _ = app.emit(&format!("export://done/{job_id}"), ());
            }
        }
    });
}

fn qi(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

fn ql(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn qn(schema: &str, name: &str) -> String {
    format!("{}.{}", qi(schema), qi(name))
}

fn pg_literal(val: Option<&str>, udt_name: &str) -> String {
    let Some(s) = val else {
        return "NULL".to_string();
    };
    let base_udt = udt_name.trim_start_matches('_');
    match base_udt {
        "int2" | "int4" | "int8" | "float4" | "float8" | "numeric" | "oid" | "money" => {
            s.to_string()
        }
        "bool" => {
            if s == "t" || s.eq_ignore_ascii_case("true") || s == "1" {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        "bytea" => {
            let hex = s.trim_start_matches("\\x");
            format!("'\\x{hex}'::bytea")
        }
        "json" => format!("{}::json", ql(s)),
        "jsonb" => format!("{}::jsonb", ql(s)),
        _ if udt_name.starts_with('_') => {

            format!("{}::{}[]", ql(s), base_udt)
        }
        _ => ql(s),
    }
}


fn topo_order(n: usize, deps: &[Vec<usize>]) -> Vec<usize> {

    let mut dependents: Vec<Vec<usize>> = vec![vec![]; n];
    let mut in_count: Vec<usize> = vec![0; n];
    for (i, d) in deps.iter().enumerate() {
        let mut seen = std::collections::HashSet::new();
        for &j in d {
            if j != i && seen.insert(j) {
                dependents[j].push(i);
                in_count[i] += 1;
            }
        }
    }
    let mut queue: std::collections::VecDeque<usize> =
        (0..n).filter(|&i| in_count[i] == 0).collect();
    let mut order = Vec::with_capacity(n);
    while let Some(node) = queue.pop_front() {
        order.push(node);
        for &dep in &dependents[node] {
            in_count[dep] -= 1;
            if in_count[dep] == 0 {
                queue.push_back(dep);
            }
        }
    }

    if order.len() < n {
        let mut placed = vec![false; n];
        for &i in &order { placed[i] = true; }
        for i in 0..n { if !placed[i] { order.push(i); } }
    }
    order
}

fn write_pg_batch(
    w: &mut impl Write,
    batch: &[Vec<String>],
    qname: &str,
    col_list: &str,
    override_clause: &str,
    conflict_suffix: &str,
) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }
    writeln!(w, "INSERT INTO {qname} ({col_list}){override_clause} VALUES")?;
    for (i, row) in batch.iter().enumerate() {
        if i < batch.len() - 1 {
            writeln!(w, "  ({})  ,", row.join(", "))?;
        } else {
            writeln!(w, "  ({}){conflict_suffix};", row.join(", "))?;
        }
    }
    Ok(())
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    let y = 1970 + days / 365;
    let md = days % 365;
    let mo = md / 30 + 1;
    let d = md % 30 + 1;
    format!("{y}-{mo:02}-{d:02} {h:02}:{m:02}:{s:02} UTC")
}

async fn do_pg_export_database<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pool: &Arc<sqlx::PgPool>,
    job_id: &str,
    path: &str,
    opts: &PgDbExportOptions,
    cancel: &Arc<AtomicBool>,
) -> Result<i64> {
    let snapshot = get_pg_schema_full(pool).await?;

    let file = File::create(path)?;
    let mut w = BufWriter::new(file);

    macro_rules! emit {
        ($written:expr, $total:expr) => {{
            let _ = app.emit(
                &format!("export://progress/{job_id}"),
                ExportProgress { written: $written, total_estimate: $total },
            );
        }};
    }

    if opts.add_comments {
        writeln!(w, "-- ZBase Studio PostgreSQL dump")?;
        writeln!(w, "-- Tables: {}", snapshot.tables.len())?;
        writeln!(w, "-- Generated: {}", chrono_now())?;
        writeln!(w, "-- Default schema: {}", snapshot.default_schema)?;
        writeln!(w)?;
    }

    writeln!(w, "SET client_encoding = 'UTF8';")?;
    writeln!(w, "SET standard_conforming_strings = on;")?;
    writeln!(w)?;

    if opts.disable_triggers {
        writeln!(w, "SET session_replication_role = 'replica';")?;
        writeln!(w)?;
    }

    if opts.wrap_transaction {
        writeln!(w, "BEGIN;")?;
        writeln!(w)?;
    }


    if opts.include_enums && !snapshot.enums.is_empty() {
        if opts.add_comments {
            writeln!(w, "-- Enum types")?;
        }
        for e in &snapshot.enums {
            let qname = qn(&e.schema, &e.name);
            if opts.drop_objects {
                writeln!(w, "DROP TYPE IF EXISTS {qname} CASCADE;")?;
            }
            let values: Vec<String> = e.values.iter().map(|v| ql(v)).collect();
            if opts.if_not_exists {
                writeln!(
                    w,
                    "DO $$ BEGIN \
                     IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace \
                     WHERE n.nspname = {} AND t.typname = {}) \
                     THEN CREATE TYPE {qname} AS ENUM ({}); END IF; \
                     END $$;",
                    ql(&e.schema),
                    ql(&e.name),
                    values.join(", ")
                )?;
            } else {
                writeln!(w, "CREATE TYPE {qname} AS ENUM ({});", values.join(", "))?;
            }
        }
        writeln!(w)?;
    }


    if opts.include_structure {
        if opts.add_comments {
            writeln!(w, "-- Table structure")?;
        }
        for t in &snapshot.tables {
            let qname = qn(&t.schema, &t.name);
            if opts.drop_objects {
                writeln!(w, "DROP TABLE IF EXISTS {qname} CASCADE;")?;
            }
            let if_ne = if opts.if_not_exists { " IF NOT EXISTS" } else { "" };
            writeln!(w, "CREATE TABLE{if_ne} {qname} (")?;

            let mut col_defs: Vec<String> = Vec::new();

            for col in &t.columns {
                let mut def = format!("  {}", qi(&col.name));


                let is_serial = !col.is_identity
                    && col.generated_expression.is_none()
                    && col.default_value.as_deref().map(|d| d.starts_with("nextval(")).unwrap_or(false);

                if col.is_identity {
                    let base_type = if col.data_type.contains("bigint") {
                        "bigint"
                    } else if col.data_type.contains("smallint") {
                        "smallint"
                    } else {
                        "integer"
                    };
                    let gen = col.identity_generation.as_deref().unwrap_or("BY DEFAULT");
                    def.push_str(&format!(" {base_type} GENERATED {gen} AS IDENTITY"));
                } else if let Some(ref gen_expr) = col.generated_expression {
                    def.push_str(&format!(" {} GENERATED ALWAYS AS ({gen_expr}) STORED", col.data_type));
                } else if is_serial {
                    let serial_kw = if col.data_type.contains("bigint") {
                        "BIGSERIAL"
                    } else if col.data_type.contains("smallint") {
                        "SMALLSERIAL"
                    } else {
                        "SERIAL"
                    };
                    def.push_str(&format!(" {serial_kw}"));
                } else {
                    def.push_str(&format!(" {}", col.data_type));
                    if let Some(ref dv) = col.default_value {
                        def.push_str(&format!(" DEFAULT {dv}"));
                    }
                }

                if col.not_null && !col.is_identity && !is_serial {
                    def.push_str(" NOT NULL");
                }
                if let Some(ref coll) = col.collation {
                    def.push_str(&format!(" COLLATE {coll}"));
                }
                col_defs.push(def);
            }


            for con in t.constraints.iter().filter(|c| c.kind == "p") {
                let cols: Vec<String> = con.columns.iter().map(|c| qi(c)).collect();
                col_defs.push(format!("  CONSTRAINT {} PRIMARY KEY ({})", qi(&con.name), cols.join(", ")));
            }
            for con in t.constraints.iter().filter(|c| c.kind == "u") {
                let cols: Vec<String> = con.columns.iter().map(|c| qi(c)).collect();
                col_defs.push(format!("  CONSTRAINT {} UNIQUE ({})", qi(&con.name), cols.join(", ")));
            }
            for con in t.constraints.iter().filter(|c| c.kind == "c") {
                if let Some(ref expr) = con.check_expr {
                    col_defs.push(format!("  CONSTRAINT {} {expr}", qi(&con.name)));
                }
            }

            writeln!(w, "{}", col_defs.join(",\n"))?;
            writeln!(w, ");")?;
            writeln!(w)?;
        }


        let has_fks = snapshot.tables.iter().any(|t| t.constraints.iter().any(|c| c.kind == "f"));
        if has_fks {
            if opts.add_comments {
                writeln!(w, "-- Foreign key constraints")?;
            }
            for t in &snapshot.tables {
                let qname = qn(&t.schema, &t.name);
                for con in t.constraints.iter().filter(|c| c.kind == "f") {
                    let local_cols: Vec<String> = con.columns.iter().map(|c| qi(c)).collect();
                    let ref_schema = con.fk_ref_schema.as_deref().unwrap_or(&t.schema);
                    let ref_table = con.fk_ref_table.as_deref().unwrap_or("");
                    let ref_cols: Vec<String> = con
                        .fk_ref_columns
                        .as_ref()
                        .map(|cols| cols.iter().map(|c| qi(c)).collect())
                        .unwrap_or_default();

                    let mut stmt = format!(
                        "ALTER TABLE {qname} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({})",
                        qi(&con.name),
                        local_cols.join(", "),
                        qn(ref_schema, ref_table),
                        ref_cols.join(", ")
                    );
                    if let Some(ref on_update) = con.fk_on_update {
                        if on_update != "NO ACTION" {
                            stmt.push_str(&format!(" ON UPDATE {on_update}"));
                        }
                    }
                    if let Some(ref on_delete) = con.fk_on_delete {
                        if on_delete != "NO ACTION" {
                            stmt.push_str(&format!(" ON DELETE {on_delete}"));
                        }
                    }
                    if con.deferrable {
                        stmt.push_str(" DEFERRABLE");
                        if con.initially_deferred {
                            stmt.push_str(" INITIALLY DEFERRED");
                        }
                    }
                    writeln!(w, "{stmt};")?;
                }
            }
            writeln!(w)?;
        }


        let has_indexes = snapshot
            .tables
            .iter()
            .any(|t| t.indexes.iter().any(|i| !i.is_primary && !i.is_unique_constraint));
        if has_indexes {
            if opts.add_comments {
                writeln!(w, "-- Indexes")?;
            }
            for t in &snapshot.tables {
                for idx in t.indexes.iter().filter(|i| !i.is_primary && !i.is_unique_constraint) {
                    let unique_kw = if idx.unique { "UNIQUE " } else { "" };
                    let cols: Vec<String> = idx.columns.iter().map(|c| {
                        let mut s = qi(&c.expr);
                        if c.direction == "DESC" {
                            s.push_str(" DESC");
                        }
                        s
                    }).collect();
                    let mut stmt = format!(
                        "CREATE {unique_kw}INDEX {} ON {} USING {} ({})",
                        qi(&idx.name),
                        qn(&t.schema, &t.name),
                        idx.method,
                        cols.join(", ")
                    );
                    if let Some(ref wh) = idx.where_clause {
                        stmt.push_str(&format!(" WHERE {wh}"));
                    }
                    writeln!(w, "{stmt};")?;
                }
            }
            writeln!(w)?;
        }
    }


    if opts.include_data {
        let conflict_suffix = if opts.insert_mode == "on_conflict_do_nothing" {
            " ON CONFLICT DO NOTHING"
        } else {
            ""
        };
        let total = snapshot.tables.len() as i64;
        let page_size = opts.batch_size.max(1).min(5000) as i64;


        let name_to_idx: std::collections::HashMap<(&str, &str), usize> = snapshot.tables
            .iter()
            .enumerate()
            .map(|(i, t)| ((t.schema.as_str(), t.name.as_str()), i))
            .collect();
        let fk_deps: Vec<Vec<usize>> = snapshot.tables.iter().map(|t| {
            t.constraints.iter()
                .filter(|c| c.kind == "f")
                .filter_map(|c| {
                    let ref_schema = c.fk_ref_schema.as_deref().unwrap_or(t.schema.as_str());
                    let ref_table = c.fk_ref_table.as_deref()?;
                    name_to_idx.get(&(ref_schema, ref_table)).copied()
                })
                .collect()
        }).collect();
        let data_order = topo_order(snapshot.tables.len(), &fk_deps);

        for (idx, &ti) in data_order.iter().enumerate() {
            let t = &snapshot.tables[ti];
            if cancel.load(Ordering::SeqCst) {
                return Err(crate::error::Error::Cancelled);
            }
            emit!(idx as i64, total);

            if opts.add_comments {
                writeln!(w, "-- Data for {}.{}", t.schema, t.name)?;
            }

            let qname = qn(&t.schema, &t.name);


            let insert_cols: Vec<&crate::db::pg_introspect::PgColumnInfo> = t
                .columns
                .iter()
                .filter(|c| c.generated_expression.is_none())
                .collect();

            if insert_cols.is_empty() {
                continue;
            }


            let has_always_identity = insert_cols.iter().any(|c| {
                c.is_identity && c.identity_generation.as_deref() == Some("ALWAYS")
            });
            let override_clause = if has_always_identity { " OVERRIDING SYSTEM VALUE" } else { "" };

            let col_list: String =
                insert_cols.iter().map(|c| qi(&c.name)).collect::<Vec<_>>().join(", ");
            let select_cols: String = insert_cols
                .iter()
                .map(|c| format!("{}::text", qi(&c.name)))
                .collect::<Vec<_>>()
                .join(", ");
            let select_sql = format!("SELECT {select_cols} FROM {qname}");

            let mut offset: i64 = 0;
            let mut last_emit = Instant::now();
            loop {
                if cancel.load(Ordering::SeqCst) {
                    return Err(crate::error::Error::Cancelled);
                }
                let page_sql = format!("{select_sql} LIMIT {page_size} OFFSET {offset}");
                let rows = sqlx::query(&page_sql)
                    .fetch_all(pool.as_ref())
                    .await
                    .map_err(|e| crate::error::Error::Postgres(e.to_string()))?;

                if rows.is_empty() {
                    break;
                }

                let mut batch: Vec<Vec<String>> = Vec::with_capacity(rows.len());
                for row in &rows {
                    let vals: Vec<String> = insert_cols
                        .iter()
                        .enumerate()
                        .map(|(i, col)| {
                            let text_val: Option<String> =
                                sqlx::Row::try_get(row, i).unwrap_or(None);
                            pg_literal(text_val.as_deref(), &col.udt_name)
                        })
                        .collect();
                    batch.push(vals);
                }
                write_pg_batch(&mut w, &batch, &qname, &col_list, override_clause, conflict_suffix)?;

                if last_emit.elapsed().as_millis() >= 200 {
                    emit!(idx as i64, total);
                    last_emit = Instant::now();
                }

                let fetched = rows.len() as i64;
                offset += fetched;
                if fetched < page_size {
                    break;
                }
            }
            writeln!(w)?;
        }
    }


    if opts.include_views {
        if opts.add_comments {
            writeln!(w, "-- Views")?;
        }
        for v in snapshot.views.iter().filter(|v| !v.materialized) {
            let qname = qn(&v.schema, &v.name);
            if opts.drop_objects {
                writeln!(w, "DROP VIEW IF EXISTS {qname} CASCADE;")?;
            }
            let def = v.definition.trim_end_matches(';').trim();
            writeln!(w, "CREATE OR REPLACE VIEW {qname} AS")?;
            writeln!(w, "{def};")?;
            writeln!(w)?;
        }
        for v in snapshot.views.iter().filter(|v| v.materialized) {
            let qname = qn(&v.schema, &v.name);
            if opts.drop_objects {
                writeln!(w, "DROP MATERIALIZED VIEW IF EXISTS {qname} CASCADE;")?;
            }
            let def = v.definition.trim_end_matches(';').trim();
            writeln!(w, "CREATE MATERIALIZED VIEW {qname} AS")?;
            writeln!(w, "{def};")?;
            writeln!(w)?;
        }
    }


    if opts.include_functions && !snapshot.functions.is_empty() {
        if opts.add_comments {
            writeln!(w, "-- Functions")?;
        }
        for f in &snapshot.functions {
            let body = f.body.trim_end_matches(';');
            writeln!(w, "{body};")?;
            writeln!(w)?;
        }
    }


    if opts.include_triggers && !snapshot.triggers.is_empty() {
        if opts.add_comments {
            writeln!(w, "-- Triggers")?;
        }
        for t in &snapshot.triggers {
            let qname = qn(&t.table_schema, &t.table);
            let events = t.events.join(" OR ");
            let fn_call = format!("{}()", qn(&t.function_schema, &t.function_name));
            let mut stmt = format!(
                "CREATE OR REPLACE TRIGGER {} {} {} ON {} FOR EACH {}",
                qi(&t.name),
                t.timing,
                events,
                qname,
                t.for_each
            );
            if let Some(ref when) = t.when_clause {
                stmt.push_str(&format!(" WHEN ({when})"));
            }
            stmt.push_str(&format!(" EXECUTE FUNCTION {fn_call};"));
            writeln!(w, "{stmt}")?;
            writeln!(w)?;
        }
    }

    if opts.wrap_transaction {
        writeln!(w, "COMMIT;")?;
        writeln!(w)?;
    }

    if opts.disable_triggers {
        writeln!(w, "SET session_replication_role = DEFAULT;")?;
    }

    Ok(snapshot.tables.len() as i64)
}
