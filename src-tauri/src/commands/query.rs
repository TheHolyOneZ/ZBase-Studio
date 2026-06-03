use crate::db::types::value_to_json;
use crate::error::Result;
use crate::state::AppState;
use rusqlite::types::Value;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
    pub rows_affected: i64,
    pub duration_ms: u64,
}

#[tauri::command]
pub fn execute_query(
    tab_id: String,
    sql: String,
    state: State<AppState>,
) -> Result<QueryResult> {
    if state.is_duck(&tab_id) {
        return execute_duck_query(&tab_id, &sql, &state);
    }

    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;

    let start = std::time::Instant::now();

    let mut stmt = conn.prepare(&sql)?;
    let col_count = stmt.column_count();
    let columns: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();

    if columns.is_empty() {
        conn.execute(&sql, [])?;
        let rows_affected = conn.changes() as i64;
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected,
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    let rows: Vec<Vec<JsonValue>> = stmt
        .query_map([], |row| {
            let cells: Vec<JsonValue> = (0..col_count)
                .map(|i| value_to_json(row.get::<_, Value>(i).unwrap_or(Value::Null)))
                .collect();
            Ok(cells)
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(QueryResult {
        rows_affected: rows.len() as i64,
        columns,
        rows,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}

fn execute_duck_query(tab_id: &str, sql: &str, state: &State<AppState>) -> Result<QueryResult> {
    use crate::db::duck_types::duck_value_to_json;
    use duckdb::types::Value as DuckValue;

    let conn = state.require_duck(tab_id)?;
    let guard = conn.lock();
    let start = std::time::Instant::now();

    let mut stmt = guard.prepare(sql)?;
    let mut rows_result = stmt.query([])?;

    let col_count = rows_result.as_ref().map(|s| s.column_count()).unwrap_or(0);

    if col_count == 0 {
        drop(rows_result);
        drop(stmt);
        let rows_affected = guard.execute(sql, [])? as i64;
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected,
            duration_ms: start.elapsed().as_millis() as u64,
        });
    }

    let columns: Vec<String> = rows_result
        .as_ref()
        .map(|s| {
            (0..col_count)
                .map(|i| s.column_name(i).map(|n| n.clone()).unwrap_or_default())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut rows = Vec::new();
    while let Some(row) = rows_result.next()? {
        let cells: Vec<JsonValue> = (0..col_count)
            .map(|i| duck_value_to_json(row.get::<_, DuckValue>(i).unwrap_or(DuckValue::Null)))
            .collect();
        rows.push(cells);
    }

    Ok(QueryResult {
        rows_affected: rows.len() as i64,
        columns,
        rows,
        duration_ms: start.elapsed().as_millis() as u64,
    })
}
