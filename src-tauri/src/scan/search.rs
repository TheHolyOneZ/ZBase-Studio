use crate::db::pool::TabPool;
use crate::db::types::value_to_json;
use crate::error::Result;
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchHit {
    pub table: String,
    pub column: String,
    pub row_index: i64,
    pub value: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub use_regex: bool,
    pub tables: Option<Vec<String>>,
}

pub fn run_full_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<TabPool>,
    job_id: String,
    needle: String,
    opts: SearchOptions,
    cancel: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(&format!("search://error/{job_id}"), e.to_string());
                return;
            }
        };

        let table_names: Vec<String> = {
            let mut stmt = match conn.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            ) {
                Ok(s) => s,
                Err(_) => return,
            };
            stmt.query_map([], |r| r.get(0))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default()
        };

        let target_tables: Vec<String> = if let Some(ref whitelist) = opts.tables {
            table_names.into_iter().filter(|t| whitelist.contains(t)).collect()
        } else {
            table_names
        };

        let regex_obj = if opts.use_regex {
            let flags = if opts.case_sensitive { "" } else { "(?i)" };
            regex::Regex::new(&format!("{}{}", flags, needle)).ok()
        } else {
            None
        };

        let mut hit_buffer: Vec<SearchHit> = Vec::new();
        let mut last_emit = std::time::Instant::now();

        'outer: for table in &target_tables {
            if cancel.load(Ordering::SeqCst) {
                break;
            }

            let col_info: Vec<String> = {
                let mut stmt = match conn
                    .prepare(&format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")))
                {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                stmt.query_map([], |r| r.get::<_, String>(1))
                    .map(|rows| rows.filter_map(|r| r.ok()).collect())
                    .unwrap_or_default()
            };

            let sql = format!("SELECT rowid, * FROM \"{}\"", table.replace('"', "\"\""));
            let mut stmt = match conn.prepare(&sql) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let row_results: Vec<Vec<Value>> = stmt
                .query_map([], |row| {
                    let col_count = row.as_ref().column_count();
                    (0..col_count)
                        .map(|i| row.get::<_, Value>(i))
                        .collect::<std::result::Result<Vec<_>, _>>()
                })
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default();

            for (row_idx, row) in row_results.iter().enumerate() {
                if cancel.load(Ordering::SeqCst) {
                    break 'outer;
                }

                for (col_i, cell) in row.iter().enumerate().skip(1) {
                    let cell_str = match cell {
                        Value::Text(s) => s.clone(),
                        Value::Integer(i) => i.to_string(),
                        Value::Real(f) => f.to_string(),
                        _ => continue,
                    };

                    let matched = if let Some(ref re) = regex_obj {
                        re.is_match(&cell_str)
                    } else if opts.case_sensitive {
                        cell_str.contains(&needle)
                    } else {
                        cell_str.to_lowercase().contains(&needle.to_lowercase())
                    };

                    if matched {
                        hit_buffer.push(SearchHit {
                            table: table.clone(),
                            column: col_info.get(col_i.saturating_sub(1)).cloned().unwrap_or_default(),
                            row_index: row_idx as i64,
                            value: value_to_json(cell.clone()),
                        });
                    }
                }

                let elapsed = last_emit.elapsed();
                if hit_buffer.len() >= 50 || elapsed.as_millis() >= 100 {
                    let _ = app.emit(&format!("search://hit/{job_id}"), &hit_buffer);
                    hit_buffer.clear();
                    last_emit = std::time::Instant::now();
                }
            }
        }

        if !hit_buffer.is_empty() {
            let _ = app.emit(&format!("search://hit/{job_id}"), &hit_buffer);
        }
        let _ = app.emit(&format!("search://done/{job_id}"), ());
    });
}

pub fn run_full_search_command<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pool: Arc<TabPool>,
    job_id: &str,
    needle: String,
    opts: SearchOptions,
    cancel: Arc<AtomicBool>,
) -> Result<()> {
    run_full_search(app.clone(), pool, job_id.to_string(), needle, opts, cancel);
    Ok(())
}
