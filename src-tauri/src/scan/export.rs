use crate::db::pool::TabPool;
use crate::db::types::value_to_json;
use crate::error::Result;
use rusqlite::types::Value;
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
pub struct ExportProgress {
    pub written: i64,
    pub total_estimate: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ExportFormat {
    Csv,
    CsvExcel,
    Tsv,
    Json,
    Sql,
    Xml,
    Yaml,
    Markdown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportOptions {
    pub table_name: Option<String>,

    pub include_structure: bool,

    pub include_data: bool,

    pub drop_table: bool,

    pub if_not_exists: bool,

    pub batch_size: usize,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            table_name: None,
            include_structure: true,
            include_data: true,
            drop_table: true,
            if_not_exists: false,
            batch_size: 500,
        }
    }
}


pub fn run_export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<TabPool>,
    job_id: String,
    sql: String,
    format: ExportFormat,
    opts: ExportOptions,
    path: String,
    cancel: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        match do_export(&app, &pool, &job_id, &sql, &format, &opts, &path, &cancel) {
            Err(e) => { let _ = app.emit(&format!("export://error/{job_id}"), e.to_string()); }
            Ok(final_count) => {


                let _ = app.emit(&format!("export://progress/{job_id}"), ExportProgress {
                    written: final_count,
                    total_estimate: final_count,
                });
                let _ = app.emit(&format!("export://done/{job_id}"), ());
            }
        }
    });
}


fn blob_hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02X}")).collect()
}

fn value_display(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::Integer(i) => i.to_string(),
        Value::Real(f) => f.to_string(),
        Value::Text(s) => s.clone(),
        Value::Blob(b) => format!("0x{}", blob_hex(b)),
    }
}

fn value_sql_literal(v: &Value) -> String {
    match v {
        Value::Null => "NULL".to_string(),
        Value::Integer(i) => i.to_string(),
        Value::Real(f) => f.to_string(),
        Value::Text(s) => format!("'{}'", s.replace('\'', "''")),
        Value::Blob(b) => format!("X'{}'", blob_hex(b)),
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn xml_element_name(name: &str) -> String {
    let mut out = String::new();
    for (i, ch) in name.chars().enumerate() {
        if ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == '.' {
            if i == 0 && ch.is_numeric() {
                out.push('_');
            }
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() { "_col".to_string() } else { out }
}

fn yaml_scalar(v: &Value) -> String {
    match v {
        Value::Null => "null".to_string(),
        Value::Integer(i) => i.to_string(),
        Value::Real(f) => f.to_string(),
        Value::Blob(b) => format!("\"0x{}\"", blob_hex(b)),
        Value::Text(s) => {
            let needs_quotes = s.is_empty()
                || s.contains('\n')
                || s.contains(": ")
                || s.contains(" #")
                || s.starts_with(' ')
                || s.ends_with(' ')
                || matches!(
                    s.to_lowercase().as_str(),
                    "true" | "false" | "null" | "yes" | "no" | "on" | "off"
                );
            if needs_quotes {
                format!(
                    "\"{}\"",
                    s.replace('\\', "\\\\")
                        .replace('"', "\\\"")
                        .replace('\n', "\\n")
                )
            } else {
                s.clone()
            }
        }
    }
}


fn write_insert_batch(
    w: &mut impl Write,
    batch: &[Vec<Value>],
    quoted_table: &str,
    col_list: &str,
) -> Result<()> {
    if batch.is_empty() {
        return Ok(());
    }
    writeln!(w, "INSERT INTO {quoted_table} ({col_list}) VALUES")?;
    for (i, row) in batch.iter().enumerate() {
        let vals: Vec<String> = row.iter().map(value_sql_literal).collect();
        let suffix = if i < batch.len() - 1 { "," } else { ";" };
        writeln!(w, "  ({}){}", vals.join(", "), suffix)?;
    }
    Ok(())
}


fn do_export<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pool: &Arc<TabPool>,
    job_id: &str,
    sql: &str,
    format: &ExportFormat,
    opts: &ExportOptions,
    path: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<i64> {
    let conn = pool.get()?;

    macro_rules! emit {
        ($written:expr) => {{
            let _ = app.emit(
                &format!("export://progress/{job_id}"),
                ExportProgress { written: $written, total_estimate: $written },
            );
        }};
    }

    let written = match format {

        ExportFormat::Csv | ExportFormat::CsvExcel => {
            let file = File::create(path)?;
            let mut bw = BufWriter::new(file);
            if matches!(format, ExportFormat::CsvExcel) {
                bw.write_all(&[0xEF, 0xBB, 0xBF])?;
            }
            let delimiter = if matches!(format, ExportFormat::CsvExcel) { b';' } else { b',' };
            let mut csv_w = csv::WriterBuilder::new()
                .delimiter(delimiter)
                .from_writer(bw);

            let mut stmt = conn.prepare(sql)?;
            let col_count = stmt.column_count();
            let columns: Vec<String> = (0..col_count)
                .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                .collect();
            csv_w.write_record(&columns).map_err(|e| crate::error::Error::Other(e.to_string()))?;

            let mut written = 0i64;
            let mut last_emit = Instant::now();
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                let fields: Vec<String> = (0..col_count)
                    .map(|i| value_display(&row.get::<_, Value>(i).unwrap_or(Value::Null)))
                    .collect();
                csv_w.write_record(&fields).map_err(|e| crate::error::Error::Other(e.to_string()))?;
                written += 1;
                if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
            }
            csv_w.flush().map_err(|e| crate::error::Error::Other(e.to_string()))?;
            written
        }


        ExportFormat::Tsv => {
            let file = File::create(path)?;
            let mut w = BufWriter::new(file);

            let mut stmt = conn.prepare(sql)?;
            let col_count = stmt.column_count();
            let columns: Vec<String> = (0..col_count)
                .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                .collect();
            writeln!(w, "{}", columns.join("\t"))?;

            let mut written = 0i64;
            let mut last_emit = Instant::now();
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                let fields: Vec<String> = (0..col_count)
                    .map(|i| {
                        value_display(&row.get::<_, Value>(i).unwrap_or(Value::Null))
                            .replace('\t', " ")
                            .replace('\n', " ")
                    })
                    .collect();
                writeln!(w, "{}", fields.join("\t"))?;
                written += 1;
                if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
            }
            written
        }


        ExportFormat::Json => {
            let file = File::create(path)?;
            let mut w = BufWriter::new(file);

            let mut stmt = conn.prepare(sql)?;
            let col_count = stmt.column_count();
            let columns: Vec<String> = (0..col_count)
                .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                .collect();

            w.write_all(b"[\n")?;
            let mut written = 0i64;
            let mut first = true;
            let mut last_emit = Instant::now();
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                if !first { w.write_all(b",\n")?; }
                first = false;
                let obj: serde_json::Map<String, serde_json::Value> = columns.iter()
                    .enumerate()
                    .map(|(i, k)| {
                        let v = row.get::<_, Value>(i).unwrap_or(Value::Null);
                        (k.clone(), value_to_json(v))
                    })
                    .collect();
                w.write_all(serde_json::to_string(&obj)?.as_bytes())?;
                written += 1;
                if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
            }
            w.write_all(b"\n]")?;
            written
        }


        ExportFormat::Sql => {
            let file = File::create(path)?;
            let mut w = BufWriter::new(file);
            let table_name = opts.table_name.as_deref().unwrap_or("data");
            let quoted = format!("\"{}\"", table_name.replace('"', "\"\""));

            writeln!(w, "-- ZBase Studio SQL dump")?;
            writeln!(w, "-- Table: {table_name}")?;
            writeln!(w, "-- Generated: {}", chrono_now())?;
            writeln!(w)?;

            if opts.include_structure {
                if opts.drop_table {
                    writeln!(w, "DROP TABLE IF EXISTS {quoted};")?;
                }
                let create_sql: Option<String> = conn
                    .query_row(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                        [table_name],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(mut ddl) = create_sql {
                    if opts.if_not_exists && !ddl.to_uppercase().contains("IF NOT EXISTS") {
                        ddl = ddl.replacen("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1);
                    }
                    writeln!(w, "{ddl};")?;
                }

                let mut idx_stmt = conn.prepare(
                    "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL"
                )?;
                let indexes: Vec<String> = idx_stmt
                    .query_map([table_name], |row| row.get(0))?
                    .filter_map(|r| r.ok())
                    .collect();
                for idx in &indexes {
                    writeln!(w, "{idx};")?;
                }
                writeln!(w)?;
            }

            let mut written = 0i64;
            if opts.include_data {
                let mut stmt = conn.prepare(sql)?;
                let col_count = stmt.column_count();
                let columns: Vec<String> = (0..col_count)
                    .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                    .collect();
                let col_list: String = columns.iter()
                    .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
                    .collect::<Vec<_>>()
                    .join(", ");
                let batch_size = opts.batch_size.max(1);

                writeln!(w, "BEGIN TRANSACTION;")?;
                let mut batch: Vec<Vec<Value>> = Vec::with_capacity(batch_size);
                let mut last_emit = Instant::now();
                let mut rows = stmt.query([])?;
                while let Some(row) = rows.next()? {
                    if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                    let values: Vec<Value> = (0..col_count)
                        .map(|i| row.get::<_, Value>(i).unwrap_or(Value::Null))
                        .collect();
                    batch.push(values);
                    if batch.len() >= batch_size {
                        write_insert_batch(&mut w, &batch, &quoted, &col_list)?;
                        batch.clear();
                    }
                    written += 1;
                    if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
                }
                write_insert_batch(&mut w, &batch, &quoted, &col_list)?;
                writeln!(w, "COMMIT;")?;
            }
            written
        }


        ExportFormat::Xml => {
            let file = File::create(path)?;
            let mut w = BufWriter::new(file);

            let mut stmt = conn.prepare(sql)?;
            let col_count = stmt.column_count();
            let columns: Vec<String> = (0..col_count)
                .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                .collect();
            let xml_cols: Vec<String> = columns.iter().map(|c| xml_element_name(c)).collect();

            writeln!(w, r#"<?xml version="1.0" encoding="UTF-8"?>"#)?;
            writeln!(w, "<data>")?;

            let mut written = 0i64;
            let mut last_emit = Instant::now();
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                writeln!(w, "  <row>")?;
                for (i, elem) in xml_cols.iter().enumerate() {
                    let v = row.get::<_, Value>(i).unwrap_or(Value::Null);
                    match &v {
                        Value::Null => writeln!(w, "    <{elem}/>")?,
                        _ => writeln!(w, "    <{elem}>{}</{elem}>", xml_escape(&value_display(&v)))?,
                    }
                }
                writeln!(w, "  </row>")?;
                written += 1;
                if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
            }
            writeln!(w, "</data>")?;
            written
        }


        ExportFormat::Yaml => {
            let file = File::create(path)?;
            let mut w = BufWriter::new(file);

            let mut stmt = conn.prepare(sql)?;
            let col_count = stmt.column_count();
            let columns: Vec<String> = (0..col_count)
                .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                .collect();

            let mut written = 0i64;
            let mut last_emit = Instant::now();
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                for (i, col) in columns.iter().enumerate() {
                    let v = row.get::<_, Value>(i).unwrap_or(Value::Null);
                    let prefix = if i == 0 { "- " } else { "  " };
                    writeln!(w, "{prefix}{col}: {}", yaml_scalar(&v))?;
                }
                written += 1;
                if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
            }
            written
        }


        ExportFormat::Markdown => {
            let file = File::create(path)?;
            let mut w = BufWriter::new(file);

            let mut stmt = conn.prepare(sql)?;
            let col_count = stmt.column_count();
            let columns: Vec<String> = (0..col_count)
                .map(|i| stmt.column_name(i).unwrap_or("").to_string())
                .collect();

            let header = columns.iter()
                .map(|c| c.replace('|', "\\|"))
                .collect::<Vec<_>>()
                .join(" | ");
            let sep = columns.iter().map(|_| "---").collect::<Vec<_>>().join(" | ");
            writeln!(w, "| {header} |")?;
            writeln!(w, "| {sep} |")?;

            let mut written = 0i64;
            let mut last_emit = Instant::now();
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
                let fields: Vec<String> = (0..col_count)
                    .map(|i| {
                        value_display(&row.get::<_, Value>(i).unwrap_or(Value::Null))
                            .replace('|', "\\|")
                            .replace('\n', " ")
                    })
                    .collect();
                writeln!(w, "| {} |", fields.join(" | "))?;
                written += 1;
                if last_emit.elapsed().as_millis() >= 200 { emit!(written); last_emit = Instant::now(); }
            }
            written
        }
    };

    Ok(written)
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbExportOptions {

    pub include_structure: bool,

    pub include_data: bool,

    pub include_indexes: bool,

    pub include_views: bool,

    pub include_triggers: bool,

    pub drop_tables: bool,

    pub if_not_exists: bool,

    pub insert_mode: String,

    pub batch_size: usize,

    pub wrap_transaction: bool,

    pub disable_fk_checks: bool,

    pub add_comments: bool,
}

impl Default for DbExportOptions {
    fn default() -> Self {
        Self {
            include_structure: true,
            include_data: true,
            include_indexes: true,
            include_views: true,
            include_triggers: true,
            drop_tables: true,
            if_not_exists: false,
            insert_mode: "insert".to_string(),
            batch_size: 500,
            wrap_transaction: true,
            disable_fk_checks: true,
            add_comments: true,
        }
    }
}

pub fn run_export_database<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<TabPool>,
    job_id: String,
    path: String,
    opts: DbExportOptions,
    cancel: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        match do_export_database(&app, &pool, &job_id, &path, &opts, &cancel) {
            Err(e) => { let _ = app.emit(&format!("export://error/{job_id}"), e.to_string()); }
            Ok(table_count) => {
                let _ = app.emit(&format!("export://progress/{job_id}"), ExportProgress {
                    written: table_count,
                    total_estimate: table_count,
                });
                let _ = app.emit(&format!("export://done/{job_id}"), ());
            }
        }
    });
}

struct DbObject {
    kind: String,
    name: String,
    sql: String,
}

fn do_export_database<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pool: &Arc<TabPool>,
    job_id: &str,
    path: &str,
    opts: &DbExportOptions,
    cancel: &Arc<AtomicBool>,
) -> Result<i64> {
    let conn = pool.get()?;
    let file = File::create(path)?;
    let mut w = BufWriter::new(file);


    let mut schema_stmt = conn.prepare(
        "SELECT type, name, sql FROM sqlite_master \
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' \
         ORDER BY rowid",
    )?;
    let objects: Vec<DbObject> = schema_stmt
        .query_map([], |row| {
            Ok(DbObject { kind: row.get(0)?, name: row.get(1)?, sql: row.get(2)? })
        })?
        .filter_map(|r| r.ok())
        .collect();
    drop(schema_stmt);

    let tables: Vec<String> = objects.iter()
        .filter(|o| o.kind == "table")
        .map(|o| o.name.clone())
        .collect();

    let insert_kw = match opts.insert_mode.as_str() {
        "replace" => "INSERT OR REPLACE INTO",
        "ignore"  => "INSERT OR IGNORE INTO",
        _         => "INSERT INTO",
    };

    let batch_size = opts.batch_size.max(1).min(5000);


    if opts.add_comments {
        writeln!(w, "-- ZBase Studio SQL dump")?;
        writeln!(w, "-- Tables: {}", tables.len())?;
        writeln!(w, "-- Generated: {}", chrono_now())?;
        writeln!(w)?;
    }

    if opts.disable_fk_checks {
        writeln!(w, "PRAGMA foreign_keys = OFF;")?;
    }
    if opts.wrap_transaction {
        writeln!(w, "BEGIN TRANSACTION;")?;
    }
    writeln!(w)?;


    if opts.include_structure {
        for obj in objects.iter().filter(|o| o.kind == "table") {
            let q = format!("\"{}\"", obj.name.replace('"', "\"\""));
            if opts.drop_tables {
                writeln!(w, "DROP TABLE IF EXISTS {q};")?;
            }
            let mut ddl = obj.sql.trim_end_matches(';').to_string();
            if opts.if_not_exists && !ddl.to_uppercase().contains("IF NOT EXISTS") {
                ddl = ddl.replacen("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1);
            }
            writeln!(w, "{ddl};")?;
            writeln!(w)?;
        }

        if opts.include_indexes {
            for obj in objects.iter().filter(|o| o.kind == "index") {
                writeln!(w, "{};", obj.sql.trim_end_matches(';'))?;
            }
            writeln!(w)?;
        }
    }


    if opts.include_data {
        let total = tables.len() as i64;
        for (idx, table_name) in tables.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) { return Err(crate::error::Error::Cancelled); }
            let _ = app.emit(
                &format!("export://progress/{job_id}"),
                ExportProgress { written: idx as i64, total_estimate: total },
            );

            let quoted = format!("\"{}\"", table_name.replace('"', "\"\""));
            let mut stmt = conn.prepare(&format!("SELECT * FROM {quoted}"))?;
            let col_count = stmt.column_count();
            let col_list: String = (0..col_count)
                .map(|i| format!("\"{}\"", stmt.column_name(i).unwrap_or("").replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(", ");

            let mut batch: Vec<Vec<Value>> = Vec::with_capacity(batch_size);
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let vals: Vec<Value> = (0..col_count)
                    .map(|i| row.get::<_, Value>(i).unwrap_or(Value::Null))
                    .collect();
                batch.push(vals);
                if batch.len() >= batch_size {
                    write_insert_batch_kw(&mut w, &batch, &quoted, &col_list, insert_kw)?;
                    batch.clear();
                }
            }
            write_insert_batch_kw(&mut w, &batch, &quoted, &col_list, insert_kw)?;
            writeln!(w)?;
        }
    }


    if opts.include_views {
        for obj in objects.iter().filter(|o| o.kind == "view") {
            writeln!(w, "{};", obj.sql.trim_end_matches(';'))?;
            writeln!(w)?;
        }
    }
    if opts.include_triggers {
        for obj in objects.iter().filter(|o| o.kind == "trigger") {
            writeln!(w, "{};", obj.sql.trim_end_matches(';'))?;
            writeln!(w)?;
        }
    }


    if opts.wrap_transaction {
        writeln!(w, "COMMIT;")?;
    }
    if opts.disable_fk_checks {
        writeln!(w, "PRAGMA foreign_keys = ON;")?;
    }
    Ok(tables.len() as i64)
}


fn write_insert_batch_kw(
    w: &mut impl Write,
    batch: &[Vec<Value>],
    quoted_table: &str,
    col_list: &str,
    kw: &str,
) -> Result<()> {
    if batch.is_empty() { return Ok(()); }
    writeln!(w, "{kw} {quoted_table} ({col_list}) VALUES")?;
    for (i, row) in batch.iter().enumerate() {
        let vals: Vec<String> = row.iter().map(value_sql_literal).collect();
        let suffix = if i < batch.len() - 1 { "," } else { ";" };
        writeln!(w, "  ({}){}", vals.join(", "), suffix)?;
    }
    Ok(())
}


pub fn run_db_backup<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<TabPool>,
    job_id: String,
    path: String,
) {
    std::thread::spawn(move || {
        match do_db_backup(&pool, &path) {
            Err(e) => { let _ = app.emit(&format!("export://error/{job_id}"), e.to_string()); }
            Ok(_) => { let _ = app.emit(&format!("export://done/{job_id}"), ()); }
        }
    });
}

fn do_db_backup(pool: &Arc<TabPool>, path: &str) -> Result<()> {
    let conn = pool.get()?;
    let mut dest = rusqlite::Connection::open(path)?;
    let backup = rusqlite::backup::Backup::new(&conn, &mut dest)?;
    backup.run_to_completion(200, std::time::Duration::from_millis(50), None)?;
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
