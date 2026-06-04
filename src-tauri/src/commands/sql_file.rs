use crate::error::Result;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::io::Read;
use tauri::{Emitter, State};

const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";
const EDITOR_SIZE_LIMIT: u64 = 256 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FileKind {
    Sqlite,
    #[serde(rename = "duckdb")]
    DuckDb,
    Script { size: u64, fits_editor: bool },
}

#[tauri::command]
pub fn detect_file_kind(path: String) -> Result<FileKind> {
    let metadata = std::fs::metadata(&path)?;
    let size = metadata.len();

    let mut f = std::fs::File::open(&path)?;
    let mut header = [0u8; 16];
    let read = f.read(&mut header)?;

    if path.to_lowercase().ends_with(".duckdb") {
        return Ok(FileKind::DuckDb);
    }

    if read >= 16 && &header[..16] == SQLITE_MAGIC {
        return Ok(FileKind::Sqlite);
    }

    Ok(FileKind::Script {
        size,
        fits_editor: size <= EDITOR_SIZE_LIMIT,
    })
}

#[tauri::command]
pub fn read_sql_file(path: String) -> Result<String> {
    let size = std::fs::metadata(&path)?.len();
    if size > EDITOR_SIZE_LIMIT {
        return Err(crate::error::Error::BadInput(format!(
            "File is {:.1} MB — too large for the editor; open it to import directly",
            size as f64 / 1_048_576.0
        )));
    }
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
pub async fn execute_sql_file(
    tab_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<ExecuteSqlResult> {
    let pool = state.require_pool(&tab_id)?;


    let raw = tokio::task::spawn_blocking(move || std::fs::read_to_string(&path))
        .await
        .map_err(|e| crate::error::Error::Other(e.to_string()))??;

    let is_mysql = crate::db::mysql_compat::is_mysql_dump(&raw);


    let result = tokio::task::spawn_blocking(move || -> Result<ExecuteSqlResult> {
        let conn = pool.get()?;
        let start = std::time::Instant::now();

        if is_mysql {

            let stmts = crate::db::mysql_compat::mysql_to_sqlite_stmts(&raw);


            let _ = conn.execute_batch("PRAGMA foreign_keys = OFF");


            conn.execute_batch("BEGIN")?;

            let mut ok: usize = 0;
            let mut skip_index: usize = 0;
            let mut skip_view: usize = 0;
            let mut skip_trigger: usize = 0;
            let mut skip_other: usize = 0;

            for stmt in &stmts {
                let stmt = stmt.trim();
                if stmt.is_empty() {
                    continue;
                }
                let with_semi = if stmt.ends_with(';') {
                    stmt.to_string()
                } else {
                    format!("{stmt};")
                };
                match conn.execute_batch(&with_semi) {
                    Ok(_) => ok += 1,
                    Err(_) => {
                        let sig = stmt[..stmt.len().min(40)].to_ascii_uppercase();
                        let sig = sig.trim_start();
                        if sig.starts_with("CREATE") && sig.contains("INDEX") {
                            skip_index += 1;
                        } else if sig.starts_with("CREATE") && sig.contains("VIEW") {
                            skip_view += 1;
                        } else if sig.starts_with("CREATE") && sig.contains("TRIGGER") {
                            skip_trigger += 1;
                        } else {
                            skip_other += 1;
                        }
                    }
                }
            }

            let _ = conn.execute_batch("COMMIT");
            let _ = conn.execute_batch("PRAGMA foreign_keys = ON");

            let total_skipped = skip_index + skip_view + skip_trigger + skip_other;
            let mut skip_parts: Vec<String> = Vec::new();
            if skip_index > 0 { skip_parts.push(format!("{skip_index} index")); }
            if skip_view > 0  { skip_parts.push(format!("{skip_view} view")); }
            if skip_trigger > 0 { skip_parts.push(format!("{skip_trigger} trigger")); }
            if skip_other > 0 { skip_parts.push(format!("{skip_other} other")); }

            Ok(ExecuteSqlResult {
                duration_ms: start.elapsed().as_millis() as u64,
                statements_hint: ok,
                skipped_hint: total_skipped,
                skipped_detail: if skip_parts.is_empty() {
                    None
                } else {
                    Some(skip_parts.join(", "))
                },
            })
        } else {
            conn.execute_batch(&raw)?;
            let count = raw.split(';').filter(|s| !s.trim().is_empty()).count();
            Ok(ExecuteSqlResult {
                duration_ms: start.elapsed().as_millis() as u64,
                statements_hint: count,
                skipped_hint: 0,
                skipped_detail: None,
            })
        }
    })
    .await
    .map_err(|e| crate::error::Error::Other(e.to_string()))??;

    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct ExecuteSqlResult {
    pub duration_ms: u64,
    pub statements_hint: usize,
    pub skipped_hint: usize,
    pub skipped_detail: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportSqlResult {
    pub executed: usize,
    pub failed: usize,
    pub duration_ms: u64,
    pub errors: Vec<ImportSqlError>,
}

#[derive(Debug, Serialize)]
pub struct ImportSqlError {
    pub index: usize,
    pub preview: String,
    pub message: String,
}

#[tauri::command]
pub async fn execute_pg_sql_file(
    app: tauri::AppHandle,
    tab_id: String,
    path: String,
    stop_on_error: bool,
    state: State<'_, AppState>,
) -> Result<ImportSqlResult> {
    let pool = state.require_pg(&tab_id)?;

    let raw = tokio::task::spawn_blocking(move || std::fs::read_to_string(&path))
        .await
        .map_err(|e| crate::error::Error::Other(e.to_string()))??;

    let stmts = crate::db::sql_splitter::split_pg(&raw);
    let total = stmts.len();
    let start = std::time::Instant::now();
    let mut executed = 0usize;
    let mut errors: Vec<ImportSqlError> = Vec::new();
    let mut last_emit = std::time::Instant::now();

    for (idx, stmt) in stmts.iter().enumerate() {
        let stmt = stmt.trim();
        if stmt.is_empty() { continue; }


        let upper = stmt.trim_start_matches('-').trim_start_matches('/').trim_start_matches('*');
        if upper.trim().is_empty() { continue; }


        if is_pg_txn_control(stmt) {
            executed += 1;
            continue;
        }

        match sqlx::query(stmt).execute(pool.as_ref()).await {
            Ok(_) => { executed += 1; }
            Err(e) => {
                let preview = stmt.chars().take(120).collect::<String>();
                errors.push(ImportSqlError {
                    index: idx,
                    preview,
                    message: e.to_string(),
                });
                if stop_on_error {
                    break;
                }
            }
        }

        if last_emit.elapsed().as_millis() >= 200 {
            let _ = app.emit(
                &format!("import://progress/{tab_id}"),
                serde_json::json!({ "written": idx + 1, "total": total }),
            );
            last_emit = std::time::Instant::now();
        }
    }

    let _ = app.emit(
        &format!("import://done/{tab_id}"),
        serde_json::json!({ "written": executed }),
    );

    Ok(ImportSqlResult {
        executed,
        failed: errors.len(),
        duration_ms: start.elapsed().as_millis() as u64,
        errors,
    })
}

fn is_pg_txn_control(stmt: &str) -> bool {
    let upper = stmt
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("--"))
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_uppercase();
    let u = upper.trim_start();
    matches!(u, "BEGIN" | "BEGIN WORK" | "BEGIN TRANSACTION"
               | "COMMIT" | "COMMIT WORK" | "COMMIT TRANSACTION"
               | "ROLLBACK" | "ROLLBACK WORK" | "ROLLBACK TRANSACTION")
        || u.starts_with("SAVEPOINT ")
        || u.starts_with("RELEASE SAVEPOINT")
        || u.starts_with("ROLLBACK TO")
}

#[tauri::command]
pub async fn execute_mysql_sql_file(
    app: tauri::AppHandle,
    tab_id: String,
    path: String,
    stop_on_error: bool,
    state: State<'_, AppState>,
) -> Result<ImportSqlResult> {
    let (pool, _flavor) = state.require_mysql(&tab_id)?;

    let raw = tokio::task::spawn_blocking(move || std::fs::read_to_string(&path))
        .await
        .map_err(|e| crate::error::Error::Other(e.to_string()))??;

    let stmts = crate::db::sql_splitter::split_mysql(&raw);
    let total = stmts.len();
    let start = std::time::Instant::now();
    let mut executed = 0usize;
    let mut errors: Vec<ImportSqlError> = Vec::new();
    let mut last_emit = std::time::Instant::now();

    for (idx, stmt) in stmts.iter().enumerate() {
        let stmt = stmt.trim();
        if stmt.is_empty() { continue; }


        if is_mysql_txn_control(stmt) {
            executed += 1;
            continue;
        }


        match sqlx::raw_sql(stmt).execute(pool.as_ref()).await {
            Ok(_) => { executed += 1; }
            Err(e) => {
                let preview = stmt.chars().take(120).collect::<String>();
                errors.push(ImportSqlError {
                    index: idx,
                    preview,
                    message: e.to_string(),
                });
                if stop_on_error {
                    break;
                }
            }
        }

        if last_emit.elapsed().as_millis() >= 200 {
            let _ = app.emit(
                &format!("import://progress/{tab_id}"),
                serde_json::json!({ "written": idx + 1, "total": total }),
            );
            last_emit = std::time::Instant::now();
        }
    }

    let _ = app.emit(
        &format!("import://done/{tab_id}"),
        serde_json::json!({ "written": executed }),
    );

    Ok(ImportSqlResult {
        executed,
        failed: errors.len(),
        duration_ms: start.elapsed().as_millis() as u64,
        errors,
    })
}

fn is_mysql_txn_control(stmt: &str) -> bool {

    let upper = stmt
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("--") && !l.starts_with('#'))
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_uppercase();
    matches!(
        upper.trim_start(),
        "BEGIN" | "BEGIN WORK" | "COMMIT" | "COMMIT WORK" | "ROLLBACK" | "ROLLBACK WORK"
    ) || upper.trim_start().starts_with("START TRANSACTION")
        || upper.trim_start().starts_with("SAVEPOINT ")
        || upper.trim_start().starts_with("RELEASE SAVEPOINT")
        || upper.trim_start().starts_with("ROLLBACK TO")
}
