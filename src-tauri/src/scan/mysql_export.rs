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
pub struct MysqlDbExportOptions {
    pub include_structure: bool,
    pub include_data: bool,
    pub include_views: bool,
    pub include_routines: bool,
    pub include_triggers: bool,
    pub drop_objects: bool,
    pub if_not_exists: bool,
    pub disable_fk_checks: bool,
    pub disable_unique_checks: bool,
    pub wrap_transaction: bool,
    pub insert_mode: String,
    pub batch_size: usize,
    pub add_comments: bool,
    pub charset_header: bool,
}

impl Default for MysqlDbExportOptions {
    fn default() -> Self {
        Self {
            include_structure: true,
            include_data: true,
            include_views: true,
            include_routines: true,
            include_triggers: true,
            drop_objects: true,
            if_not_exists: false,
            disable_fk_checks: true,
            disable_unique_checks: true,
            wrap_transaction: true,
            insert_mode: "insert".to_string(),
            batch_size: 500,
            add_comments: true,
            charset_header: true,
        }
    }
}

pub fn run_mysql_export_database<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<sqlx::MySqlPool>,
    job_id: String,
    path: String,
    opts: MysqlDbExportOptions,
    cancel: Arc<AtomicBool>,
) {
    tokio::spawn(async move {
        match do_mysql_export_database(&app, &pool, &job_id, &path, &opts, &cancel).await {
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
    format!("`{}`", s.replace('`', "``"))
}

fn ql(s: &str) -> String {
    format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn mysql_literal(val: Option<&str>, data_type: &str, is_hex: bool) -> String {
    let Some(s) = val else {
        return "NULL".to_string();
    };
    if is_hex {


        return if s.is_empty() { "X''".to_string() } else { format!("0x{s}") };
    }
    let dt = data_type.to_lowercase();
    match dt.as_str() {
        "tinyint" | "smallint" | "mediumint" | "int" | "integer" | "bigint"
        | "float" | "double" | "decimal" | "numeric" | "year" | "bit" => s.to_string(),
        _ => ql(s),
    }
}

fn col_str(row: &sqlx::mysql::MySqlRow, idx: usize) -> String {
    use sqlx::Row;
    row.try_get::<String, _>(idx)
        .or_else(|_| {
            row.try_get::<Vec<u8>, _>(idx)
                .map(|b| String::from_utf8_lossy(&b).into_owned())
        })
        .unwrap_or_default()
}

fn col_str_opt(row: &sqlx::mysql::MySqlRow, idx: usize) -> Option<String> {
    use sqlx::Row;
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v;
    }
    row.try_get::<Option<Vec<u8>>, _>(idx)
        .ok()
        .flatten()
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn is_blob_type(data_type: &str) -> bool {
    let dt = data_type.to_lowercase();
    matches!(
        dt.as_str(),
        "blob" | "tinyblob" | "mediumblob" | "longblob" | "binary" | "varbinary"
    )
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

fn write_mysql_batch(
    w: &mut impl Write,
    batch: &[Vec<String>],
    qtable: &str,
    col_list: &str,
    insert_kw: &str,
) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }
    writeln!(w, "{insert_kw} INTO {qtable} ({col_list}) VALUES")?;
    for (i, row) in batch.iter().enumerate() {
        if i < batch.len() - 1 {
            writeln!(w, "  ({})  ,", row.join(", "))?;
        } else {
            writeln!(w, "  ({});", row.join(", "))?;
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

struct ColMeta {
    data_type: String,
    is_hex: bool,
    select_expr: String,
    quoted: String,
}

async fn get_col_meta(pool: &sqlx::MySqlPool, table: &str) -> Result<Vec<ColMeta>> {
    let rows = sqlx::query(
        "SELECT COLUMN_NAME, DATA_TYPE \
         FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? \
         ORDER BY ORDINAL_POSITION",
    )
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    let mut metas = Vec::new();
    for row in rows {
        let col_name = col_str(&row, 0);
        let data_type = col_str(&row, 1);
        let is_hex = is_blob_type(&data_type);
        let qname = qi(&col_name);
        let select_expr = if is_hex {
            format!("HEX({qname})")
        } else if data_type.to_lowercase() == "bit" {
            format!("CAST({qname} AS UNSIGNED)")
        } else {
            format!("CAST({qname} AS CHAR)")
        };
        let quoted = qname;
        metas.push(ColMeta { data_type, is_hex, select_expr, quoted });
    }
    Ok(metas)
}

async fn do_mysql_export_database<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pool: &Arc<sqlx::MySqlPool>,
    job_id: &str,
    path: &str,
    opts: &MysqlDbExportOptions,
    cancel: &Arc<AtomicBool>,
) -> Result<i64> {

    let db_row = sqlx::query("SELECT DATABASE()")
        .fetch_one(pool.as_ref())
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
    let current_db: String = {
        use sqlx::Row;
        db_row.try_get::<Option<String>, _>(0).unwrap_or(None).unwrap_or_default()
    };


    let table_rows = sqlx::query(
        "SELECT TABLE_NAME FROM information_schema.TABLES \
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' \
         ORDER BY TABLE_NAME",
    )
    .fetch_all(pool.as_ref())
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
    let tables_alpha: Vec<String> = table_rows.iter().map(|r| col_str(r, 0)).collect();


    let fk_rows = sqlx::query(
        "SELECT TABLE_NAME, REFERENCED_TABLE_NAME \
         FROM information_schema.KEY_COLUMN_USAGE \
         WHERE TABLE_SCHEMA = DATABASE() \
           AND REFERENCED_TABLE_NAME IS NOT NULL \
           AND REFERENCED_TABLE_SCHEMA = DATABASE()",
    )
    .fetch_all(pool.as_ref())
    .await
    .unwrap_or_default();
    let name_to_idx: std::collections::HashMap<&str, usize> = tables_alpha
        .iter()
        .enumerate()
        .map(|(i, t)| (t.as_str(), i))
        .collect();
    let mut fk_deps: Vec<Vec<usize>> = vec![vec![]; tables_alpha.len()];
    for row in &fk_rows {
        let tbl = col_str(row, 0);
        let ref_tbl = col_str(row, 1);
        if let (Some(&i), Some(&j)) =
            (name_to_idx.get(tbl.as_str()), name_to_idx.get(ref_tbl.as_str()))
        {
            fk_deps[i].push(j);
        }
    }
    let sorted_indices = topo_order(tables_alpha.len(), &fk_deps);
    let tables: Vec<String> = sorted_indices.iter().map(|&i| tables_alpha[i].clone()).collect();

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
        writeln!(w, "-- ZBase Studio MySQL/MariaDB dump")?;
        writeln!(w, "-- Database: {current_db}")?;
        writeln!(w, "-- Tables: {}", tables.len())?;
        writeln!(w, "-- Generated: {}", chrono_now())?;
        writeln!(w)?;
    }

    if opts.charset_header {
        writeln!(w, "/*!40101 SET NAMES utf8mb4 */;")?;
        writeln!(w, "SET NAMES utf8mb4;")?;
        writeln!(w)?;
    }

    if opts.disable_fk_checks {
        writeln!(w, "SET FOREIGN_KEY_CHECKS = 0;")?;
    }
    if opts.disable_unique_checks {
        writeln!(w, "SET UNIQUE_CHECKS = 0;")?;
    }
    if opts.wrap_transaction {
        writeln!(w, "START TRANSACTION;")?;
    }
    writeln!(w)?;


    if opts.include_structure {
        if opts.add_comments {
            writeln!(w, "-- Table structure")?;
        }
        for table in &tables {
            let qt = qi(table);
            if opts.drop_objects {
                writeln!(w, "DROP TABLE IF EXISTS {qt};")?;
            }


            let create_row = sqlx::query(&format!("SHOW CREATE TABLE {qt}"))
                .fetch_one(pool.as_ref())
                .await
                .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
            let mut create_sql = col_str(&create_row, 1);

            if opts.if_not_exists && !create_sql.contains("IF NOT EXISTS") {
                create_sql = create_sql.replacen("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1);
            }

            writeln!(w, "{create_sql};")?;
            writeln!(w)?;
        }
    }


    if opts.include_data {
        let insert_kw = match opts.insert_mode.as_str() {
            "replace" => "REPLACE",
            "ignore" => "INSERT IGNORE",
            _ => "INSERT",
        };
        let total = tables.len() as i64;
        let page_size = opts.batch_size.max(1).min(5000) as i64;

        for (tidx, table) in tables.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                return Err(crate::error::Error::Cancelled);
            }
            emit!(tidx as i64, total);

            let cols = get_col_meta(pool, table).await?;
            if cols.is_empty() {
                continue;
            }

            if opts.add_comments {
                writeln!(w, "-- Data for table {table}")?;
            }

            let qt = qi(table);
            let select_exprs: Vec<String> = cols.iter().map(|c| c.select_expr.clone()).collect();
            let col_list: String = cols.iter().map(|c| c.quoted.clone()).collect::<Vec<_>>().join(", ");
            let select_sql = format!("SELECT {} FROM {qt}", select_exprs.join(", "));

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
                    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

                if rows.is_empty() {
                    break;
                }

                let mut batch: Vec<Vec<String>> = Vec::with_capacity(rows.len());
                for row in &rows {
                    let vals: Vec<String> = cols
                        .iter()
                        .enumerate()
                        .map(|(i, col)| {
                            let text_val = col_str_opt(&row, i);
                            mysql_literal(text_val.as_deref(), &col.data_type, col.is_hex)
                        })
                        .collect();
                    batch.push(vals);
                }
                write_mysql_batch(&mut w, &batch, &qt, &col_list, insert_kw)?;

                if last_emit.elapsed().as_millis() >= 200 {
                    emit!(tidx as i64, total);
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
        let view_rows = sqlx::query(
            "SELECT TABLE_NAME FROM information_schema.VIEWS \
             WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
        )
        .fetch_all(pool.as_ref())
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
        let views: Vec<String> = view_rows.iter().map(|r| col_str(r, 0)).collect();

        if !views.is_empty() {
            if opts.add_comments {
                writeln!(w, "-- Views")?;
            }
            for view in &views {
                let qv = qi(view);
                if opts.drop_objects {
                    writeln!(w, "DROP VIEW IF EXISTS {qv};")?;
                }
                let create_row = sqlx::query(&format!("SHOW CREATE VIEW {qv}"))
                    .fetch_one(pool.as_ref())
                    .await
                    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
                let create_sql = col_str(&create_row, 1);
                writeln!(w, "{create_sql};")?;
                writeln!(w)?;
            }
        }
    }


    if opts.include_routines {
        for routine_type in &["PROCEDURE", "FUNCTION"] {
            let routine_rows = sqlx::query(
                "SELECT ROUTINE_NAME FROM information_schema.ROUTINES \
                 WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = ? \
                 ORDER BY ROUTINE_NAME",
            )
            .bind(*routine_type)
            .fetch_all(pool.as_ref())
            .await
            .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
            let routines: Vec<String> = routine_rows.iter().map(|r| col_str(r, 0)).collect();

            if !routines.is_empty() {
                if opts.add_comments {
                    writeln!(w, "-- {}s", routine_type.to_lowercase().replace("function", "Function").replace("procedure", "Procedure"))?;
                }
                for name in &routines {
                    let qn = qi(name);
                    if opts.drop_objects {
                        writeln!(w, "DROP {routine_type} IF EXISTS {qn};")?;
                    }
                    let show_row = sqlx::query(&format!("SHOW CREATE {routine_type} {qn}"))
                        .fetch_one(pool.as_ref())
                        .await
                        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

                    let create_sql = col_str(&show_row, 2);
                    if !create_sql.is_empty() {
                        writeln!(w, "DELIMITER //")?;
                        writeln!(w, "{create_sql}//")?;
                        writeln!(w, "DELIMITER ;")?;
                        writeln!(w)?;
                    }
                }
            }
        }
    }


    if opts.include_triggers {
        let trigger_rows = sqlx::query(
            "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS \
             WHERE TRIGGER_SCHEMA = DATABASE() ORDER BY TRIGGER_NAME",
        )
        .fetch_all(pool.as_ref())
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
        let triggers: Vec<String> = trigger_rows.iter().map(|r| col_str(r, 0)).collect();

        if !triggers.is_empty() {
            if opts.add_comments {
                writeln!(w, "-- Triggers")?;
            }
            for trig in &triggers {
                if opts.drop_objects {
                    writeln!(w, "DROP TRIGGER IF EXISTS {};", qi(trig))?;
                }
                let show_row = sqlx::query(&format!("SHOW CREATE TRIGGER {}", qi(trig)))
                    .fetch_one(pool.as_ref())
                    .await
                    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

                let create_sql = col_str(&show_row, 2);
                if !create_sql.is_empty() {
                    writeln!(w, "DELIMITER //")?;
                    writeln!(w, "{create_sql}//")?;
                    writeln!(w, "DELIMITER ;")?;
                    writeln!(w)?;
                }
            }
        }
    }

    if opts.wrap_transaction {
        writeln!(w, "COMMIT;")?;
        writeln!(w)?;
    }

    if opts.disable_unique_checks {
        writeln!(w, "SET UNIQUE_CHECKS = 1;")?;
    }
    if opts.disable_fk_checks {
        writeln!(w, "SET FOREIGN_KEY_CHECKS = 1;")?;
    }


    Ok(tables.len() as i64)
}
