use crate::error::Result;
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct PgTableStat {
    pub schema: String,
    pub name: String,
    pub rows: i64,
    pub size_bytes: i64,
    pub index_size_bytes: i64,
}

#[derive(Debug, Serialize)]
pub struct PgOverview {
    pub engine: String,
    pub db_size_bytes: i64,
    pub dead_tuples_total: i64,
    pub tables: Vec<PgTableStat>,
}

#[tauri::command]
pub async fn compute_pg_overview(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<PgOverview> {
    use sqlx::Row;
    let pool = state.require_pg(&tab_id)?;

    let db_size: i64 = sqlx::query_scalar("SELECT pg_database_size(current_database())")
        .fetch_one(pool.as_ref())
        .await
        .unwrap_or(0);

    let dead_tuples: i64 =
        sqlx::query_scalar("SELECT COALESCE(sum(n_dead_tup), 0)::bigint FROM pg_stat_user_tables")
            .fetch_one(pool.as_ref())
            .await
            .unwrap_or(0);

    let rows = sqlx::query(
        "SELECT n.nspname, c.relname, \
         GREATEST(c.reltuples::bigint, 0) AS rows, \
         COALESCE(pg_relation_size(c.oid), 0) AS size_bytes, \
         COALESCE(pg_indexes_size(c.oid), 0) AS index_size_bytes \
         FROM pg_class c \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE c.relkind = 'r' \
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
         ORDER BY c.reltuples DESC",
    )
    .fetch_all(pool.as_ref())
    .await?;

    let tables = rows
        .iter()
        .map(|r| PgTableStat {
            schema: r.get("nspname"),
            name: r.get("relname"),
            rows: r.get("rows"),
            size_bytes: r.get("size_bytes"),
            index_size_bytes: r.get("index_size_bytes"),
        })
        .collect();

    Ok(PgOverview {
        engine: "pg".to_string(),
        db_size_bytes: db_size,
        dead_tuples_total: dead_tuples,
        tables,
    })
}
