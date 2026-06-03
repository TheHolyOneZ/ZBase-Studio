use crate::error::Result;
use crate::scan::search::SearchOptions;
use crate::scan::pg_search::run_pg_search;
use crate::state::{AppState, JobHandle};
use std::sync::{Arc, atomic::AtomicBool};
use tauri::State;

#[tauri::command]
pub async fn start_pg_full_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    tab_id: String,
    job_id: String,
    needle: String,
    opts: SearchOptions,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.require_pg(&tab_id)?;
    let cancel = Arc::new(AtomicBool::new(false));

    state.jobs.write().insert(
        job_id.clone(),
        JobHandle { cancel: cancel.clone() },
    );

    tokio::spawn(run_pg_search(app, pool, job_id, needle, opts, cancel));
    Ok(())
}
