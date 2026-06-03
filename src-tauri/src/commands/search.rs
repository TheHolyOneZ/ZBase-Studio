use crate::error::Result;
use crate::scan::search::{run_full_search_command, SearchOptions};
use crate::state::{AppState, JobHandle};
use std::sync::{Arc, atomic::AtomicBool};
use tauri::State;

#[tauri::command]
pub fn start_full_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    tab_id: String,
    job_id: String,
    needle: String,
    opts: SearchOptions,
    state: State<AppState>,
) -> Result<()> {
    let pool = state.require_pool(&tab_id)?;
    let cancel = Arc::new(AtomicBool::new(false));

    state.jobs.write().insert(
        job_id.clone(),
        JobHandle { cancel: cancel.clone() },
    );

    run_full_search_command(&app, pool, &job_id, needle, opts, cancel)?;
    Ok(())
}

#[tauri::command]
pub fn cancel_job(job_id: String, state: State<AppState>) -> Result<()> {
    state.cancel_job(&job_id);
    Ok(())
}
