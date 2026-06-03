use crate::error::Result;
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct MysqlTableStat {
    pub schema: String,
    pub name: String,
    pub engine: String,
    pub rows: i64,
    pub data_length: i64,
    pub index_length: i64,
    pub collation: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MysqlOverview {
    pub engine: String,
    pub default_charset: String,
    pub tables: Vec<MysqlTableStat>,
}

#[tauri::command]
pub async fn compute_mysql_overview(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<MysqlOverview> {
    use sqlx::Row;
    let (pool, _flavor) = state.require_mysql(&tab_id)?;

    let default_charset: String =
        sqlx::query_scalar("SELECT @@character_set_database")
            .fetch_one(pool.as_ref())
            .await
            .unwrap_or_else(|_| "utf8mb4".to_string());

    let rows = sqlx::query(
        "SELECT CONVERT(TABLE_SCHEMA USING utf8mb4) AS TABLE_SCHEMA, \
                CONVERT(TABLE_NAME USING utf8mb4) AS TABLE_NAME, \
                CONVERT(COALESCE(ENGINE, '') USING utf8mb4) AS ENGINE, \
                CAST(COALESCE(TABLE_ROWS, 0) AS SIGNED) AS TABLE_ROWS, \
                CAST(COALESCE(DATA_LENGTH, 0) AS SIGNED) AS DATA_LENGTH, \
                CAST(COALESCE(INDEX_LENGTH, 0) AS SIGNED) AS INDEX_LENGTH, \
                CONVERT(TABLE_COLLATION USING utf8mb4) AS TABLE_COLLATION \
         FROM information_schema.TABLES \
         WHERE TABLE_TYPE = 'BASE TABLE' \
           AND CONVERT(TABLE_SCHEMA USING utf8mb4) NOT IN \
               ('mysql', 'information_schema', 'performance_schema', 'sys') \
         ORDER BY TABLE_SCHEMA, TABLE_NAME",
    )
    .fetch_all(pool.as_ref())
    .await?;

    let tables = rows
        .iter()
        .map(|r| MysqlTableStat {
            schema: r.get("TABLE_SCHEMA"),
            name: r.get("TABLE_NAME"),
            engine: r.get("ENGINE"),
            rows: r.get::<i64, _>("TABLE_ROWS"),
            data_length: r.get::<i64, _>("DATA_LENGTH"),
            index_length: r.get::<i64, _>("INDEX_LENGTH"),
            collation: r.try_get("TABLE_COLLATION").ok().flatten(),
        })
        .collect();

    Ok(MysqlOverview {
        engine: "mysql".to_string(),
        default_charset,
        tables,
    })
}
