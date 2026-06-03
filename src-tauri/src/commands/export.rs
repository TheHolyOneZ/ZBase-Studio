use crate::error::Result;
use crate::scan::export::{run_export, run_export_database, run_db_backup, DbExportOptions, ExportFormat, ExportOptions};
use crate::state::{AppState, JobHandle, JobId};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, atomic::AtomicBool};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportRequest {
    pub tab_id: String,
    pub sql: String,
    pub format: String,
    pub path: String,
    pub job_id: Option<String>,

    pub table_name: Option<String>,
    pub include_structure: Option<bool>,
    pub include_data: Option<bool>,
    pub drop_table: Option<bool>,
    pub if_not_exists: Option<bool>,
    pub batch_size: Option<usize>,
}

#[tauri::command]
pub fn start_export<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    req: ExportRequest,
    state: State<AppState>,
) -> Result<JobId> {
    let pool = state.require_pool(&req.tab_id)?;
    let job_id = req.job_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let cancel = Arc::new(AtomicBool::new(false));

    let format = match req.format.to_lowercase().as_str() {
        "csv_excel" => ExportFormat::CsvExcel,
        "tsv" => ExportFormat::Tsv,
        "json" => ExportFormat::Json,
        "sql" => ExportFormat::Sql,
        "xml" => ExportFormat::Xml,
        "yaml" => ExportFormat::Yaml,
        "markdown" => ExportFormat::Markdown,
        _ => ExportFormat::Csv,
    };

    let opts = ExportOptions {
        table_name: req.table_name,
        include_structure: req.include_structure.unwrap_or(true),
        include_data: req.include_data.unwrap_or(true),
        drop_table: req.drop_table.unwrap_or(true),
        if_not_exists: req.if_not_exists.unwrap_or(false),
        batch_size: req.batch_size.unwrap_or(500).max(1).min(5000),
    };

    state.jobs.write().insert(job_id.clone(), JobHandle { cancel: cancel.clone() });
    run_export(app, pool, job_id.clone(), req.sql, format, opts, req.path, cancel);
    Ok(job_id)
}


#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct DbExportRequest {
    pub tab_id: String,
    pub format: String,
    pub path: String,
    pub job_id: Option<String>,

    pub include_structure: Option<bool>,
    pub include_data: Option<bool>,
    pub include_indexes: Option<bool>,
    pub include_views: Option<bool>,
    pub include_triggers: Option<bool>,
    pub drop_tables: Option<bool>,
    pub if_not_exists: Option<bool>,
    pub insert_mode: Option<String>,
    pub batch_size: Option<usize>,
    pub wrap_transaction: Option<bool>,
    pub disable_fk_checks: Option<bool>,
    pub add_comments: Option<bool>,
}


#[tauri::command]
pub fn export_database<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    req: DbExportRequest,
    state: State<AppState>,
) -> Result<JobId> {
    let pool = state.require_pool(&req.tab_id)?;
    let job_id = req.job_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());

    match req.format.to_lowercase().as_str() {
        "db" => {
            run_db_backup(app, pool, job_id.clone(), req.path);
        }
        _ => {
            let def = DbExportOptions::default();
            let opts = DbExportOptions {
                include_structure: req.include_structure.unwrap_or(def.include_structure),
                include_data:      req.include_data.unwrap_or(def.include_data),
                include_indexes:   req.include_indexes.unwrap_or(def.include_indexes),
                include_views:     req.include_views.unwrap_or(def.include_views),
                include_triggers:  req.include_triggers.unwrap_or(def.include_triggers),
                drop_tables:       req.drop_tables.unwrap_or(def.drop_tables),
                if_not_exists:     req.if_not_exists.unwrap_or(def.if_not_exists),
                insert_mode:       req.insert_mode.unwrap_or(def.insert_mode),
                batch_size:        req.batch_size.unwrap_or(def.batch_size),
                wrap_transaction:  req.wrap_transaction.unwrap_or(def.wrap_transaction),
                disable_fk_checks: req.disable_fk_checks.unwrap_or(def.disable_fk_checks),
                add_comments:      req.add_comments.unwrap_or(def.add_comments),
            };
            let cancel = Arc::new(AtomicBool::new(false));
            state.jobs.write().insert(job_id.clone(), JobHandle { cancel: cancel.clone() });
            run_export_database(app, pool, job_id.clone(), req.path, opts, cancel);
        }
    }
    Ok(job_id)
}
