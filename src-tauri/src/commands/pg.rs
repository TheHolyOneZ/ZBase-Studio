use crate::db::introspect::SchemaSnapshot;
use crate::db::pg_introspect::PgSchemaSnapshot;
use crate::db::paging::{ColumnMeta, RowFilter, RowPage, SortSpec};
use crate::commands::mutate::{DeleteRowsRequest, InsertRowRequest, RowEditRequest};
use crate::error::{Error, Result};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{Column, Row, TypeInfo};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgConnectRequest {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub ssl_mode: String,
}

#[tauri::command]
pub async fn open_pg_db(
    req: PgConnectRequest,
    state: State<'_, AppState>,
) -> Result<String> {
    let ssl = match req.ssl_mode.as_str() {
        "require" => "require",
        "disable" => "disable",
        _ => "prefer",
    };
    let url = format!(
        "postgres://{}:{}@{}:{}/{}?sslmode={}",
        urlenc(&req.user),
        urlenc(&req.password),
        req.host,
        req.port,
        urlenc(&req.database),
        ssl,
    );

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .map_err(|e| Error::Postgres(e.to_string()))?;

    let tab_id = uuid::Uuid::new_v4().to_string();
    state.pg_pools.write().insert(tab_id.clone(), Arc::new(pool));
    Ok(tab_id)
}

#[tauri::command]
pub fn close_pg_db(tab_id: String, state: State<'_, AppState>) {
    state.pg_pools.write().remove(&tab_id);
}

#[tauri::command]
pub async fn get_pg_schema(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<SchemaSnapshot> {
    let pool = state.require_pg(&tab_id)?;
    crate::db::pg_introspect::get_pg_schema(&pool).await
}

#[derive(Debug, Serialize)]
pub struct PgQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
    pub rows_affected: i64,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn execute_pg_query(
    tab_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<PgQueryResult> {
    use sqlx::Executor;

    let pool = state.require_pg(&tab_id)?;
    let start = std::time::Instant::now();


    let trimmed = sql.trim().to_ascii_lowercase();
    let returns_rows = trimmed.starts_with("select")
        || trimmed.starts_with("with")
        || trimmed.starts_with("show")
        || trimmed.starts_with("explain")
        || trimmed.starts_with("table");

    if returns_rows {
        let rows = pool.fetch_all(sqlx::raw_sql(&sql))
            .await
            .map_err(|e| Error::Postgres(e.to_string()))?;

        let columns: Vec<String> = rows
            .first()
            .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
            .unwrap_or_default();

        let result_rows: Vec<Vec<JsonValue>> = rows
            .iter()
            .map(|row| (0..row.columns().len()).map(|i| pg_value_to_json(row, i)).collect())
            .collect();

        Ok(PgQueryResult {
            rows_affected: result_rows.len() as i64,
            columns,
            rows: result_rows,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    } else {
        let result = pool.execute(sqlx::raw_sql(&sql))
            .await
            .map_err(|e| Error::Postgres(e.to_string()))?;

        Ok(PgQueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: result.rows_affected() as i64,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }
}

#[tauri::command]
pub async fn execute_pg_ddl(
    tab_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<()> {
    use sqlx::Executor;
    let pool = state.require_pg(&tab_id)?;
    pool.execute(sqlx::raw_sql(&sql))
        .await
        .map_err(|e| Error::Postgres(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn apply_pg_row_edit(req: RowEditRequest, state: State<'_, AppState>) -> Result<()> {
    use sqlx::Executor;
    if req.changes.is_empty() { return Ok(()); }
    let pool = state.require_pg(&req.tab_id)?;

    let set_clause = req.changes.iter()
        .map(|(k, v)| format!("\"{}\" = {}", k.replace('"', "\"\""), pg_json_literal(v)))
        .collect::<Vec<_>>().join(", ");

    let where_clause = req.pk_columns.iter().zip(req.pk_values.iter())
        .map(|(k, v)| format!("\"{}\" = {}", k.replace('"', "\"\""), pg_json_literal(v)))
        .collect::<Vec<_>>().join(" AND ");

    let sql = format!(
        "UPDATE \"{}\" SET {} WHERE {}",
        req.table.replace('"', "\"\""), set_clause, where_clause
    );
    pool.execute(sqlx::raw_sql(&sql)).await.map_err(|e| Error::Postgres(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn insert_pg_row(req: InsertRowRequest, state: State<'_, AppState>) -> Result<()> {
    use sqlx::Executor;
    if req.values.is_empty() {
        return Err(Error::BadInput("values cannot be empty".into()));
    }
    let pool = state.require_pg(&req.tab_id)?;

    let cols = req.values.keys()
        .map(|k| format!("\"{}\"", k.replace('"', "\"\"")))
        .collect::<Vec<_>>().join(", ");
    let vals = req.values.values()
        .map(pg_json_literal)
        .collect::<Vec<_>>().join(", ");

    let sql = format!(
        "INSERT INTO \"{}\" ({}) VALUES ({})",
        req.table.replace('"', "\"\""), cols, vals
    );
    pool.execute(sqlx::raw_sql(&sql)).await.map_err(|e| Error::Postgres(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_pg_rows(req: DeleteRowsRequest, state: State<'_, AppState>) -> Result<()> {
    use sqlx::Executor;
    let pool = state.require_pg(&req.tab_id)?;

    for pk_vals in &req.pk_values_list {
        let where_clause = req.pk_columns.iter().zip(pk_vals.iter())
            .map(|(k, v)| format!("\"{}\" = {}", k.replace('"', "\"\""), pg_json_literal(v)))
            .collect::<Vec<_>>().join(" AND ");
        let sql = format!(
            "DELETE FROM \"{}\" WHERE {}",
            req.table.replace('"', "\"\""), where_clause
        );
        pool.execute(sqlx::raw_sql(&sql)).await.map_err(|e| Error::Postgres(e.to_string()))?;
    }
    Ok(())
}

fn pg_json_literal(v: &JsonValue) -> String {
    match v {
        JsonValue::Null => "NULL".to_string(),
        JsonValue::Bool(b) => b.to_string(),
        JsonValue::Number(n) => n.to_string(),
        JsonValue::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

#[tauri::command]
pub async fn get_pg_rows(
    tab_id: String,
    table: String,
    offset: i64,
    page_size: i64,
    filters: Vec<RowFilter>,
    sort: Option<SortSpec>,
    state: State<'_, AppState>,
) -> Result<RowPage> {
    use sqlx::Executor;

    let pool = state.require_pg(&tab_id)?;
    let q_table = format!("\"{}\"", table.replace('"', "\"\""));


    let total_estimate: i64 = pool
        .fetch_one(sqlx::raw_sql(&format!(
            "SELECT reltuples::bigint FROM pg_class \
             WHERE relname = '{}' AND relnamespace = 'public'::regnamespace",
            table.replace('\'', "''")
        )))
        .await
        .and_then(|r| r.try_get::<i64, _>(0))
        .unwrap_or(0)
        .max(0);


    let mut where_parts: Vec<String> = Vec::new();
    for f in &filters {
        let col = format!("\"{}\"", f.column.replace('"', "\"\""));
        let clause = match f.op.as_str() {
            "is_null"  => format!("{col} IS NULL"),
            "not_null" => format!("{col} IS NOT NULL"),
            "like"     => format!("{col} ILIKE {}", pg_literal(&f.value.to_string())),
            "="        => format!("{col} = {}", pg_literal(&json_val_str(&f.value))),
            "!="       => format!("{col} != {}", pg_literal(&json_val_str(&f.value))),
            "<"        => format!("{col} < {}", pg_literal(&json_val_str(&f.value))),
            ">"        => format!("{col} > {}", pg_literal(&json_val_str(&f.value))),
            "<="       => format!("{col} <= {}", pg_literal(&json_val_str(&f.value))),
            ">="       => format!("{col} >= {}", pg_literal(&json_val_str(&f.value))),
            _          => continue,
        };
        where_parts.push(clause);
    }
    let where_sql = if where_parts.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", where_parts.join(" AND "))
    };


    let order_sql = sort.as_ref().map(|s| {
        let dir = if s.desc { "DESC" } else { "ASC" };
        format!(" ORDER BY \"{}\" {dir}", s.column.replace('"', "\"\""))
    }).unwrap_or_default();

    let sql = format!(
        "SELECT * FROM {q_table}{where_sql}{order_sql} LIMIT {page_size} OFFSET {offset}"
    );

    let rows = pool
        .fetch_all(sqlx::raw_sql(&sql))
        .await
        .map_err(|e| Error::Postgres(e.to_string()))?;

    let columns: Vec<ColumnMeta> = rows
        .first()
        .map(|r| {
            r.columns()
                .iter()
                .map(|c| ColumnMeta { name: c.name().to_string(), decl_type: c.type_info().name().to_string() })
                .collect()
        })
        .unwrap_or_default();


    let total_estimate = if total_estimate == 0 && !rows.is_empty() {
        rows.len() as i64 + offset
    } else {
        total_estimate.max(rows.len() as i64 + offset)
    };

    let result_rows: Vec<Vec<JsonValue>> = rows
        .iter()
        .map(|row| (0..row.columns().len()).map(|i| pg_value_to_json(row, i)).collect())
        .collect();

    let next_offset = if result_rows.len() < page_size as usize {
        None
    } else {
        Some(offset + page_size)
    };

    Ok(RowPage { columns, rows: result_rows, next_offset, total_estimate })
}

fn pg_literal(s: &str) -> String {

    let inner = if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        &s[1..s.len() - 1]
    } else {
        s
    };
    format!("'{}'", inner.replace('\'', "''"))
}

fn json_val_str(v: &JsonValue) -> String {
    match v {
        JsonValue::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn pg_value_to_json(row: &sqlx::postgres::PgRow, i: usize) -> JsonValue {
    use sqlx::types::chrono::{NaiveDate, NaiveDateTime};


    if let Ok(v) = row.try_get::<Option<bool>, _>(i) {
        return match v { Some(b) => JsonValue::Bool(b), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<i16>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(i) {
        return match v {
            Some(f) => serde_json::Number::from_f64(f)
                .map(JsonValue::Number)
                .unwrap_or(JsonValue::Null),
            None => JsonValue::Null,
        };
    }
    if let Ok(v) = row.try_get::<Option<NaiveDateTime>, _>(i) {
        return match v { Some(dt) => JsonValue::String(dt.to_string()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<NaiveDate>, _>(i) {
        return match v { Some(d) => JsonValue::String(d.to_string()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<serde_json::Value>, _>(i) {
        return v.unwrap_or(JsonValue::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(i) {
        return match v { Some(s) => JsonValue::String(s), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(i) {
        return match v {
            Some(b) => {
                use base64::Engine as _;
                JsonValue::String(base64::engine::general_purpose::STANDARD.encode(&b))
            }
            None => JsonValue::Null,
        };
    }
    JsonValue::Null
}

#[tauri::command]
pub async fn get_pg_schema_full(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<PgSchemaSnapshot> {
    let pool = state.require_pg(&tab_id)?;
    crate::db::pg_introspect::get_pg_schema_full(&pool).await
}

#[tauri::command]
pub async fn execute_pg_ddl_atomic(
    tab_id: String,
    statements: Vec<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    use sqlx::Executor;
    let pool = state.require_pg(&tab_id)?;
    let mut conn = pool.acquire().await.map_err(|e| Error::Postgres(e.to_string()))?;
    conn.execute(sqlx::raw_sql("BEGIN"))
        .await
        .map_err(|e| Error::Postgres(e.to_string()))?;
    for (i, stmt) in statements.iter().enumerate() {
        if let Err(e) = conn.execute(sqlx::raw_sql(stmt.as_str())).await {
            let _ = conn.execute(sqlx::raw_sql("ROLLBACK")).await;
            return Err(Error::PostgresDdl { index: i, message: e.to_string() });
        }
    }
    conn.execute(sqlx::raw_sql("COMMIT"))
        .await
        .map_err(|e| Error::Postgres(e.to_string()))?;
    Ok(())
}

fn urlenc(s: &str) -> String {
    s.chars()
        .flat_map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
                vec![c]
            } else {
                format!("%{:02X}", c as u32).chars().collect()
            }
        })
        .collect()
}
