use crate::db::types::json_to_value;
use crate::error::Result;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct RowEditRequest {
    pub tab_id: String,
    pub table: String,
    pub pk_columns: Vec<String>,
    pub pk_values: Vec<JsonValue>,
    pub changes: HashMap<String, JsonValue>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InsertRowRequest {
    pub tab_id: String,
    pub table: String,
    pub values: HashMap<String, JsonValue>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteRowsRequest {
    pub tab_id: String,
    pub table: String,
    pub pk_columns: Vec<String>,
    pub pk_values_list: Vec<Vec<JsonValue>>,
}

#[tauri::command]
pub fn apply_row_edit(req: RowEditRequest, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&req.tab_id)?;
    let conn = pool.get()?;

    if req.changes.is_empty() {
        return Ok(());
    }

    let set_clause: Vec<String> = req
        .changes
        .keys()
        .map(|k| format!("\"{}\" = ?", k.replace('"', "\"\"")))
        .collect();

    let where_clause: Vec<String> = req
        .pk_columns
        .iter()
        .map(|k| format!("\"{}\" = ?", k.replace('"', "\"\"")))
        .collect();

    let sql = format!(
        "UPDATE \"{}\" SET {} WHERE {}",
        req.table.replace('"', "\"\""),
        set_clause.join(", "),
        where_clause.join(" AND ")
    );

    let mut params: Vec<rusqlite::types::Value> = req
        .changes
        .values()
        .map(|v| json_to_value(v.clone()))
        .collect();
    for v in &req.pk_values {
        params.push(json_to_value(v.clone()));
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

#[tauri::command]
pub fn insert_row(req: InsertRowRequest, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&req.tab_id)?;
    let conn = pool.get()?;

    if req.values.is_empty() {
        return Err(crate::error::Error::BadInput("values cannot be empty".into()));
    }

    let cols: Vec<String> = req
        .values
        .keys()
        .map(|k| format!("\"{}\"", k.replace('"', "\"\"")))
        .collect();

    let placeholders: Vec<&str> = (0..req.values.len()).map(|_| "?").collect();

    let sql = format!(
        "INSERT INTO \"{}\" ({}) VALUES ({})",
        req.table.replace('"', "\"\""),
        cols.join(", "),
        placeholders.join(", ")
    );

    let params: Vec<rusqlite::types::Value> =
        req.values.values().map(|v| json_to_value(v.clone())).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

#[tauri::command]
pub fn delete_rows(req: DeleteRowsRequest, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&req.tab_id)?;
    let conn = pool.get()?;

    let where_clause: Vec<String> = req
        .pk_columns
        .iter()
        .map(|k| format!("\"{}\" = ?", k.replace('"', "\"\"")))
        .collect();

    let sql = format!(
        "DELETE FROM \"{}\" WHERE {}",
        req.table.replace('"', "\"\""),
        where_clause.join(" AND ")
    );

    for pk_vals in &req.pk_values_list {
        let params: Vec<rusqlite::types::Value> =
            pk_vals.iter().map(|v| json_to_value(v.clone())).collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
        conn.execute(&sql, param_refs.as_slice())?;
    }
    Ok(())
}
