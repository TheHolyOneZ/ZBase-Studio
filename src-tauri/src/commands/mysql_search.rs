use crate::error::Result;
use crate::scan::search::SearchOptions;
use crate::scan::mysql_search::run_mysql_search;
use crate::state::{AppState, JobHandle};
use std::sync::{Arc, atomic::AtomicBool};
use tauri::State;

#[tauri::command]
pub async fn start_mysql_full_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    tab_id: String,
    job_id: String,
    needle: String,
    opts: SearchOptions,
    state: State<'_, AppState>,
) -> Result<()> {
    let (pool, _flavor) = state.require_mysql(&tab_id)?;
    let cancel = Arc::new(AtomicBool::new(false));

    state.jobs.write().insert(
        job_id.clone(),
        JobHandle { cancel: cancel.clone() },
    );

    tokio::spawn(run_mysql_search(app, pool, job_id, needle, opts, cancel));
    Ok(())
}
