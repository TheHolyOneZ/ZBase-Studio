use crate::db::duck_paging::read_rows_duck;
use crate::db::paging::{read_rows, RowFilter, RowPage, SortSpec};
use crate::error::Result;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_rows(
    tab_id: String,
    table: String,
    offset: i64,
    page_size: i64,
    filters: Vec<RowFilter>,
    sort: Option<SortSpec>,
    state: State<AppState>,
) -> Result<RowPage> {
    if state.is_duck(&tab_id) {
        let conn = state.require_duck(&tab_id)?;
        let guard = conn.lock();
        return read_rows_duck(&guard, &table, offset, page_size, &filters, sort.as_ref());
    }
    let pool = state.require_pool(&tab_id)?;
    let conn = pool.get()?;
    read_rows(&conn, &table, offset, page_size, &filters, sort.as_ref())
}
