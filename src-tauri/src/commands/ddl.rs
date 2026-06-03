use crate::error::Result;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnDef {
    pub name: String,
    pub type_name: String,
    pub notnull: bool,
    pub default_value: Option<String>,
    pub primary_key: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTableRequest {
    pub tab_id: String,
    pub name: String,
    pub columns: Vec<ColumnDef>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateIndexRequest {
    pub tab_id: String,
    pub name: String,
    pub table: String,
    pub columns: Vec<String>,
    pub unique: bool,
}

#[tauri::command]
pub fn create_table(req: CreateTableRequest, state: State<AppState>) -> Result<String> {
    if req.columns.is_empty() {
        return Err(crate::error::Error::BadInput("table must have at least one column".into()));
    }

    let col_defs: Vec<String> = req
        .columns
        .iter()
        .map(|c| {
            let mut def = format!(
                "\"{}\" {}",
                c.name.replace('"', "\"\""),
                c.type_name
            );
            if c.primary_key {
                def.push_str(" PRIMARY KEY");
            }
            if c.notnull && !c.primary_key {
                def.push_str(" NOT NULL");
            }
            if let Some(ref dv) = c.default_value {
                def.push_str(&format!(" DEFAULT {}", dv));
            }
            def
        })
        .collect();

    let sql = format!(
        "CREATE TABLE \"{}\" ({});",
        req.name.replace('"', "\"\""),
        col_defs.join(", ")
    );

    let pool = state.require_pool(&req.tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch(&sql)?;
    Ok(sql)
}

#[tauri::command]
pub fn create_index(req: CreateIndexRequest, state: State<AppState>) -> Result<String> {
    let unique_kw = if req.unique { "UNIQUE " } else { "" };
    let cols: Vec<String> = req
        .columns
        .iter()
        .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
        .collect();

    let sql = format!(
        "CREATE {}INDEX \"{}\" ON \"{}\" ({});",
        unique_kw,
        req.name.replace('"', "\"\""),
        req.table.replace('"', "\"\""),
        cols.join(", ")
    );

    let pool = state.require_pool(&req.tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch(&sql)?;
    Ok(sql)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DropRequest {
    pub tab_id: String,
    pub kind: String,
    pub name: String,
}

#[tauri::command]
pub fn drop_object(req: DropRequest, state: State<AppState>) -> Result<String> {
    let kind = match req.kind.to_lowercase().as_str() {
        "table" => "TABLE",
        "index" => "INDEX",
        "view" => "VIEW",
        "trigger" => "TRIGGER",
        other => {
            return Err(crate::error::Error::BadInput(format!("unknown object kind: {other}")));
        }
    };

    let sql = format!("DROP {} IF EXISTS \"{}\";", kind, req.name.replace('"', "\"\""));
    let pool = state.require_pool(&req.tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch(&sql)?;
    Ok(sql)
}

#[tauri::command]
pub fn execute_ddl(tab_id: String, sql: String, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch(&sql)?;
    Ok(())
}
