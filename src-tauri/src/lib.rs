pub mod commands;
pub mod db;
pub mod error;
pub mod scan;
pub mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "zbase_studio=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::connection::open_db,
            commands::connection::open_duck_db,
            commands::connection::close_db,
            commands::schema::get_db_schema,
            commands::rows::get_rows,
            commands::query::execute_query,
            commands::mutate::apply_row_edit,
            commands::mutate::insert_row,
            commands::mutate::delete_rows,
            commands::txn::begin_txn,
            commands::txn::commit_txn,
            commands::txn::rollback_txn,
            commands::ddl::create_table,
            commands::ddl::create_index,
            commands::ddl::drop_object,
            commands::ddl::execute_ddl,
            commands::stats::compute_overview,
            commands::stats::compute_column_stats,
            commands::search::start_full_search,
            commands::search::cancel_job,
            commands::export::start_export,
            commands::export::export_database,
            commands::sql_file::detect_file_kind,
            commands::sql_file::read_sql_file,
            commands::sql_file::execute_sql_file,
            commands::csv::infer_csv_schema,
            commands::csv::import_csv,
            commands::pg::open_pg_db,
            commands::pg::close_pg_db,
            commands::pg::get_pg_schema,
            commands::pg::get_pg_rows,
            commands::pg::apply_pg_row_edit,
            commands::pg::insert_pg_row,
            commands::pg::delete_pg_rows,
            commands::pg::execute_pg_query,
            commands::pg::execute_pg_ddl,
            commands::pg::get_pg_schema_full,
            commands::pg::execute_pg_ddl_atomic,
            commands::mysql::open_mysql_db,
            commands::mysql::close_mysql_db,
            commands::mysql::get_mysql_schema,
            commands::mysql::get_mysql_schema_full,
            commands::mysql::execute_mysql_query,
            commands::mysql::execute_mysql_ddl,
            commands::mysql::execute_mysql_ddl_atomic,
            commands::mysql::get_mysql_rows,
            commands::mysql::apply_mysql_row_edit,
            commands::mysql::insert_mysql_row,
            commands::mysql::delete_mysql_rows,
            commands::pg_stats::compute_pg_overview,
            commands::mysql_stats::compute_mysql_overview,
            commands::pg_search::start_pg_full_search,
            commands::mysql_search::start_mysql_full_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZBase Studio")
}
