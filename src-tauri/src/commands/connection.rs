use crate::db::pool::open_pool;
use crate::error::Result;
use crate::state::{AppState, TabId};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: TabId,
    pub path: String,
}

#[tauri::command]
pub fn open_db(path: String, state: State<AppState>) -> Result<TabId> {
    let pool = open_pool(&path)?;
    let id = Uuid::new_v4().to_string();
    state.pools.write().insert(id.clone(), Arc::new(pool));
    Ok(id)
}

#[tauri::command]
pub fn open_duck_db(path: String, state: State<AppState>) -> Result<TabId> {
    let conn = crate::db::duck_conn::open_duck(&path)?;
    let id = Uuid::new_v4().to_string();
    state.duck_conns.write().insert(id.clone(), conn);
    Ok(id)
}

#[tauri::command]
pub fn close_db(tab_id: String, state: State<AppState>) -> Result<()> {
    state.pools.write().remove(&tab_id);
    state.duck_conns.write().remove(&tab_id);
    Ok(())
}
