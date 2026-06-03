use crate::error::Result;
use crate::state::{AppState, JobHandle, JobId};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, atomic::AtomicBool, atomic::Ordering};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct CsvColumnPreview {
    pub name: String,
    pub inferred_type: String,
    pub nullable: bool,
}

#[derive(Debug, Serialize)]
pub struct CsvSchemaPreview {
    pub columns: Vec<CsvColumnPreview>,
    pub sample_rows: Vec<Vec<String>>,
    pub total_rows_estimate: u64,
}

#[derive(Debug, Deserialize)]
pub struct CsvImportRequest {
    pub tab_id: String,
    pub path: String,
    pub table_name: String,
    pub columns: Vec<(String, String)>,
    pub delimiter: String,
    pub has_header: bool,
    pub batch_size: Option<usize>,
}

const SAMPLE_ROWS: usize = 200;

fn delimiter_byte(s: &str) -> u8 {
    match s {
        "\\t" | "\t" => b'\t',
        ";" => b';',
        "|" => b'|',
        _ => b',',
    }
}

fn infer_type(values: &[String]) -> (String, bool) {
    let mut any_non_empty = false;
    let mut any_null = false;
    let mut all_int = true;
    let mut all_real = true;

    for v in values {
        if v.is_empty() {
            any_null = true;
            continue;
        }
        any_non_empty = true;
        if v.parse::<i64>().is_err() {
            all_int = false;
        }
        if v.parse::<f64>().is_err() {
            all_real = false;
        }
    }

    if !any_non_empty {
        return ("TEXT".into(), true);
    }
    let type_name = if all_int { "INTEGER" } else if all_real { "REAL" } else { "TEXT" };
    (type_name.into(), any_null)
}

#[tauri::command]
pub fn infer_csv_schema(path: String, delimiter: String, has_header: bool) -> Result<CsvSchemaPreview> {
    let delim = delimiter_byte(&delimiter);
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(has_header)
        .flexible(true)
        .from_path(&path)
        .map_err(|e| crate::error::Error::Io(std::io::Error::other(e.to_string())))?;

    let header_names: Vec<String> = if has_header {
        rdr.headers()
            .map_err(|e| crate::error::Error::Io(std::io::Error::other(e.to_string())))?
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        Vec::new()
    };

    let mut col_values: Vec<Vec<String>> = Vec::new();
    let mut sample_rows: Vec<Vec<String>> = Vec::new();
    let mut total: u64 = 0;
    let mut col_count = header_names.len();

    for result in rdr.records() {
        let rec = result.map_err(|e| crate::error::Error::Io(std::io::Error::other(e.to_string())))?;
        total += 1;
        if col_count == 0 {
            col_count = rec.len();
        }
        if col_values.len() < col_count {
            col_values.resize(col_count, Vec::new());
        }
        let row: Vec<String> = (0..col_count).map(|i| rec.get(i).unwrap_or("").to_string()).collect();
        if total <= SAMPLE_ROWS as u64 {
            for (i, v) in row.iter().enumerate() {
                if i < col_values.len() {
                    col_values[i].push(v.clone());
                }
            }
            sample_rows.push(row);
        }
    }

    let columns: Vec<CsvColumnPreview> = (0..col_count)
        .map(|i| {
            let name = header_names.get(i).cloned().unwrap_or_else(|| format!("col{}", i + 1));
            let (inferred_type, nullable) = infer_type(col_values.get(i).map(Vec::as_slice).unwrap_or(&[]));
            CsvColumnPreview { name, inferred_type, nullable }
        })
        .collect();

    Ok(CsvSchemaPreview { columns, sample_rows, total_rows_estimate: total })
}

#[tauri::command]
pub fn import_csv<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    req: CsvImportRequest,
    state: State<AppState>,
) -> Result<JobId> {
    let pool = state.require_pool(&req.tab_id)?;
    let job_id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    state.jobs.write().insert(job_id.clone(), JobHandle { cancel: cancel.clone() });

    let jid = job_id.clone();
    std::thread::spawn(move || {
        let _ = do_import_csv(app, pool, jid, req, cancel);
    });

    Ok(job_id)
}

fn do_import_csv<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<crate::db::pool::TabPool>,
    job_id: String,
    req: CsvImportRequest,
    cancel: Arc<AtomicBool>,
) -> Result<()> {
    use tauri::Emitter;
    use rusqlite::types::Value;

    let delim = delimiter_byte(&req.delimiter);
    let batch_size = req.batch_size.unwrap_or(500).max(1).min(5000);
    let ncols = req.columns.len();

    let conn = pool.get()?;


    let col_defs: Vec<String> = req.columns.iter()
        .map(|(name, typ)| format!("\"{}\" {}", name.replace('"', "\"\""), typ))
        .collect();
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS \"{}\" ({});",
        req.table_name.replace('"', "\"\""),
        col_defs.join(", ")
    ))?;


    let placeholders = (1..=ncols).map(|_| "?").collect::<Vec<_>>().join(", ");
    let insert_sql = format!(
        "INSERT INTO \"{}\" VALUES ({})",
        req.table_name.replace('"', "\"\""),
        placeholders
    );

    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(req.has_header)
        .flexible(true)
        .from_path(&req.path)
        .map_err(|e| crate::error::Error::Io(std::io::Error::other(e.to_string())))?;

    let mut written: u64 = 0;
    let mut batch: Vec<Vec<Value>> = Vec::with_capacity(batch_size);

    let flush = |conn: &rusqlite::Connection, batch: &Vec<Vec<Value>>, insert_sql: &str| -> Result<()> {
        conn.execute_batch("BEGIN")?;
        let mut stmt = conn.prepare(insert_sql)?;
        for row in batch {
            stmt.execute(rusqlite::params_from_iter(row.iter()))?;
        }
        conn.execute_batch("COMMIT")?;
        Ok(())
    };

    for result in rdr.records() {
        if cancel.load(Ordering::Relaxed) { break; }
        let rec = result.map_err(|e| crate::error::Error::Io(std::io::Error::other(e.to_string())))?;
        let row: Vec<Value> = (0..ncols)
            .map(|i| {
                let s = rec.get(i).unwrap_or("");
                if s.is_empty() { Value::Null } else { Value::Text(s.to_string()) }
            })
            .collect();
        batch.push(row);

        if batch.len() >= batch_size {
            flush(&conn, &batch, &insert_sql)?;
            written += batch.len() as u64;
            batch.clear();
            let _ = app.emit(&format!("import://progress/{job_id}"), serde_json::json!({ "written": written }));
        }
    }

    if !batch.is_empty() {
        flush(&conn, &batch, &insert_sql)?;
        written += batch.len() as u64;
    }

    let _ = app.emit(&format!("import://done/{job_id}"), serde_json::json!({ "written": written }));
    Ok(())
}
