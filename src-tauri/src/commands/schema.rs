use crate::db::duck_introspect::get_duck_schema;
use crate::db::introspect::{get_schema, SchemaSnapshot};
use crate::error::Result;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_db_schema(tab_id: String, state: State<AppState>) -> Result<SchemaSnapshot> {
    if state.is_duck(&tab_id) {
        let conn = state.require_duck(&tab_id)?;
        let guard = conn.lock();
        return get_duck_schema(&guard);
    }
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;
    get_schema(&conn)
}
