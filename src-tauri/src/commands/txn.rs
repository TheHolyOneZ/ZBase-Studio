use crate::error::Result;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn begin_txn(tab_id: String, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch("BEGIN;")?;
    Ok(())
}

#[tauri::command]
pub fn commit_txn(tab_id: String, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch("COMMIT;")?;
    Ok(())
}

#[tauri::command]
pub fn rollback_txn(tab_id: String, state: State<AppState>) -> Result<()> {
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;
    conn.execute_batch("ROLLBACK;")?;
    Ok(())
}
