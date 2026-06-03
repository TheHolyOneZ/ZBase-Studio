use crate::error::Result;
use crate::state::AppState;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct TableOverview {
    pub name: String,
    pub row_count: i64,
    pub page_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbOverview {
    pub file_size_bytes: Option<i64>,
    pub page_size: i64,
    pub page_count: i64,
    pub free_pages: i64,
    pub journal_mode: String,
    pub integrity_ok: bool,
    pub integrity_errors: Vec<String>,
    pub tables: Vec<TableOverview>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnStats {
    pub column: String,
    pub null_count: i64,
    pub distinct_count: i64,
    pub min_value: serde_json::Value,
    pub max_value: serde_json::Value,
}

#[tauri::command]
pub fn compute_overview(tab_id: String, state: State<AppState>) -> Result<DbOverview> {
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;

    let page_size: i64 = conn.query_row("PRAGMA page_size", [], |r| r.get(0)).unwrap_or(4096);
    let page_count: i64 =
        conn.query_row("PRAGMA page_count", [], |r| r.get(0)).unwrap_or(0);
    let free_pages: i64 =
        conn.query_row("PRAGMA freelist_count", [], |r| r.get(0)).unwrap_or(0);
    let journal_mode: String =
        conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap_or_default();

    let integrity = integrity_check(&conn);
    let integrity_ok = integrity.is_empty() || integrity == ["ok"];
    let integrity_errors: Vec<String> =
        if integrity_ok { vec![] } else { integrity };

    let tables = get_table_overviews(&conn)?;

    Ok(DbOverview {
        file_size_bytes: None,
        page_size,
        page_count,
        free_pages,
        journal_mode,
        integrity_ok,
        integrity_errors,
        tables,
    })
}

fn integrity_check(conn: &Connection) -> Vec<String> {
    let mut stmt = match conn.prepare("PRAGMA integrity_check(100)") {
        Ok(s) => s,
        Err(_) => return vec!["integrity_check failed".into()],
    };
    stmt.query_map([], |r| r.get::<_, String>(0))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

fn get_table_overviews(conn: &Connection) -> Result<Vec<TableOverview>> {
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )?;
    let names: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tables = Vec::new();
    for name in names {
        let row_count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\"")),
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        tables.push(TableOverview { name, row_count, page_count: None });
    }
    Ok(tables)
}

#[tauri::command]
pub fn compute_column_stats(
    tab_id: String,
    table: String,
    column: String,
    state: State<AppState>,
) -> Result<ColumnStats> {
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;

    let col = column.replace('"', "\"\"");
    let tbl = table.replace('"', "\"\"");

    let null_count: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM \"{}\" WHERE \"{}\" IS NULL", tbl, col),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let distinct_count: i64 = conn
        .query_row(
            &format!("SELECT COUNT(DISTINCT \"{}\") FROM \"{}\"", col, tbl),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let min_value = conn
        .query_row(
            &format!("SELECT MIN(\"{}\") FROM \"{}\"", col, tbl),
            [],
            |r| r.get::<_, rusqlite::types::Value>(0),
        )
        .map(crate::db::types::value_to_json)
        .unwrap_or(serde_json::Value::Null);

    let max_value = conn
        .query_row(
            &format!("SELECT MAX(\"{}\") FROM \"{}\"", col, tbl),
            [],
            |r| r.get::<_, rusqlite::types::Value>(0),
        )
        .map(crate::db::types::value_to_json)
        .unwrap_or(serde_json::Value::Null);

    Ok(ColumnStats { column, null_count, distinct_count, min_value, max_value })
}
