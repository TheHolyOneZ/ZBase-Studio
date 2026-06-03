use crate::db::introspect::SchemaSnapshot;
use crate::db::mysql_introspect::MysqlSchemaSnapshot;
use crate::db::paging::{ColumnMeta, RowFilter, RowPage, SortSpec};
use crate::commands::mutate::{DeleteRowsRequest, InsertRowRequest, RowEditRequest};
use crate::error::{Error, Result};
use crate::state::{AppState, MysqlFlavor};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{Column, Row, TypeInfo};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlConnectRequest {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub flavor: String,
}

#[tauri::command]
pub async fn open_mysql_db(
    req: MysqlConnectRequest,
    state: State<'_, AppState>,
) -> Result<String> {
    let url = format!(
        "mysql://{}:{}@{}:{}/{}",
        urlenc(&req.user),
        urlenc(&req.password),
        req.host,
        req.port,
        urlenc(&req.database),
    );

    let pool = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .map_err(|e| Error::Mysql(e.to_string()))?;

    let flavor = if req.flavor == "mariadb" { MysqlFlavor::MariaDb } else { MysqlFlavor::MySql };
    let tab_id = uuid::Uuid::new_v4().to_string();
    state.mysql_pools.write().insert(tab_id.clone(), (Arc::new(pool), flavor));
    Ok(tab_id)
}

#[tauri::command]
pub fn close_mysql_db(tab_id: String, state: State<'_, AppState>) {
    state.mysql_pools.write().remove(&tab_id);
}

#[tauri::command]
pub async fn get_mysql_schema(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<SchemaSnapshot> {
    let (pool, _flavor) = state.require_mysql(&tab_id)?;
    crate::db::mysql_introspect::get_mysql_schema(&pool).await
}

#[derive(Debug, Serialize)]
pub struct MysqlQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
    pub rows_affected: i64,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn execute_mysql_query(
    tab_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<MysqlQueryResult> {
    use sqlx::Executor;

    let (pool, _flavor) = state.require_mysql(&tab_id)?;
    let start = std::time::Instant::now();

    let trimmed = sql.trim().to_ascii_lowercase();
    let returns_rows = trimmed.starts_with("select")
        || trimmed.starts_with("with")
        || trimmed.starts_with("show")
        || trimmed.starts_with("explain")
        || trimmed.starts_with("describe")
        || trimmed.starts_with("desc")
        || trimmed.starts_with("call");

    if returns_rows {
        let rows = pool.fetch_all(sqlx::raw_sql(&sql))
            .await
            .map_err(|e| Error::Mysql(e.to_string()))?;

        let columns: Vec<String> = rows
            .first()
            .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
            .unwrap_or_default();

        let result_rows: Vec<Vec<JsonValue>> = rows
            .iter()
            .map(|row| (0..row.columns().len()).map(|i| mysql_value_to_json(row, i)).collect())
            .collect();

        Ok(MysqlQueryResult {
            rows_affected: result_rows.len() as i64,
            columns,
            rows: result_rows,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    } else {
        let result = pool.execute(sqlx::raw_sql(&sql))
            .await
            .map_err(|e| Error::Mysql(e.to_string()))?;

        Ok(MysqlQueryResult {
            columns: vec![],
            rows: vec![],
            rows_affected: result.rows_affected() as i64,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }
}

#[tauri::command]
pub async fn execute_mysql_ddl(
    tab_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<()> {
    use sqlx::Executor;
    let (pool, _flavor) = state.require_mysql(&tab_id)?;
    pool.execute(sqlx::raw_sql(&sql))
        .await
        .map_err(|e| Error::Mysql(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn execute_mysql_ddl_atomic(
    tab_id: String,
    statements: Vec<String>,
    state: State<'_, AppState>,
) -> Result<()> {
    use sqlx::Executor;
    let (pool, _flavor) = state.require_mysql(&tab_id)?;


    for (i, stmt) in statements.iter().enumerate() {
        pool.execute(sqlx::raw_sql(stmt.as_str()))
            .await
            .map_err(|e| Error::MysqlDdl { index: i, message: e.to_string() })?;
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_mysql_row_edit(req: RowEditRequest, state: State<'_, AppState>) -> Result<()> {
    use sqlx::Executor;
    if req.changes.is_empty() { return Ok(()); }
    let (pool, _flavor) = state.require_mysql(&req.tab_id)?;

    let set_clause = req.changes.iter()
        .map(|(k, v)| format!("{} = {}", q(k), mysql_json_literal(v)))
        .collect::<Vec<_>>().join(", ");

    let where_clause = req.pk_columns.iter().zip(req.pk_values.iter())
        .map(|(k, v)| format!("{} = {}", q(k), mysql_json_literal(v)))
        .collect::<Vec<_>>().join(" AND ");

    let sql = format!("UPDATE {} SET {} WHERE {}", q(&req.table), set_clause, where_clause);
    pool.execute(sqlx::raw_sql(&sql)).await.map_err(|e| Error::Mysql(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn insert_mysql_row(req: InsertRowRequest, state: State<'_, AppState>) -> Result<()> {
    use sqlx::Executor;
    if req.values.is_empty() {
        return Err(Error::BadInput("values cannot be empty".into()));
    }
    let (pool, _flavor) = state.require_mysql(&req.tab_id)?;

    let cols = req.values.keys()
        .map(|k| q(k))
        .collect::<Vec<_>>().join(", ");
    let vals = req.values.values()
        .map(mysql_json_literal)
        .collect::<Vec<_>>().join(", ");

    let sql = format!("INSERT INTO {} ({}) VALUES ({})", q(&req.table), cols, vals);
    pool.execute(sqlx::raw_sql(&sql)).await.map_err(|e| Error::Mysql(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_mysql_rows(req: DeleteRowsRequest, state: State<'_, AppState>) -> Result<()> {
    use sqlx::Executor;
    let (pool, _flavor) = state.require_mysql(&req.tab_id)?;

    for pk_vals in &req.pk_values_list {
        let where_clause = req.pk_columns.iter().zip(pk_vals.iter())
            .map(|(k, v)| format!("{} = {}", q(k), mysql_json_literal(v)))
            .collect::<Vec<_>>().join(" AND ");
        let sql = format!("DELETE FROM {} WHERE {}", q(&req.table), where_clause);
        pool.execute(sqlx::raw_sql(&sql)).await.map_err(|e| Error::Mysql(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_mysql_rows(
    tab_id: String,
    table: String,
    offset: i64,
    page_size: i64,
    filters: Vec<RowFilter>,
    sort: Option<SortSpec>,
    state: State<'_, AppState>,
) -> Result<RowPage> {
    use sqlx::Executor;

    let (pool, _flavor) = state.require_mysql(&tab_id)?;
    let q_table = q(&table);


    let db_row = sqlx::query("SELECT DATABASE()")
        .fetch_one(&*pool)
        .await
        .map_err(|e| Error::Mysql(e.to_string()))?;
    let current_db: Option<String> = db_row.try_get(0).ok().flatten();

    let total_estimate: i64 = if let Some(ref db) = current_db {
        pool.fetch_one(sqlx::raw_sql(&format!(
            "SELECT TABLE_ROWS FROM information_schema.TABLES \
             WHERE TABLE_SCHEMA = '{}' AND TABLE_NAME = '{}'",
            db.replace('\'', "''"),
            table.replace('\'', "''")
        )))
        .await
        .and_then(|r| r.try_get::<Option<i64>, _>(0))
        .ok()
        .flatten()
        .unwrap_or(0)
        .max(0)
    } else {
        0
    };

    let mut where_parts: Vec<String> = Vec::new();
    for f in &filters {
        let col = q(&f.column);
        let clause = match f.op.as_str() {
            "is_null"  => format!("{col} IS NULL"),
            "not_null" => format!("{col} IS NOT NULL"),
            "like"     => format!("{col} LIKE {}", mysql_literal(&f.value.to_string())),
            "="        => format!("{col} = {}", mysql_literal(&json_val_str(&f.value))),
            "!="       => format!("{col} != {}", mysql_literal(&json_val_str(&f.value))),
            "<"        => format!("{col} < {}", mysql_literal(&json_val_str(&f.value))),
            ">"        => format!("{col} > {}", mysql_literal(&json_val_str(&f.value))),
            "<="       => format!("{col} <= {}", mysql_literal(&json_val_str(&f.value))),
            ">="       => format!("{col} >= {}", mysql_literal(&json_val_str(&f.value))),
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
        format!(" ORDER BY {} {dir}", q(&s.column))
    }).unwrap_or_default();

    let sql = format!(
        "SELECT * FROM {q_table}{where_sql}{order_sql} LIMIT {page_size} OFFSET {offset}"
    );

    let rows = pool
        .fetch_all(sqlx::raw_sql(&sql))
        .await
        .map_err(|e| Error::Mysql(e.to_string()))?;

    let columns: Vec<ColumnMeta> = rows
        .first()
        .map(|r| {
            r.columns()
                .iter()
                .map(|c| ColumnMeta { name: c.name().to_string(), decl_type: c.type_info().name().to_string() })
                .collect()
        })
        .unwrap_or_default();

    let total_estimate = total_estimate.max(rows.len() as i64 + offset);

    let result_rows: Vec<Vec<JsonValue>> = rows
        .iter()
        .map(|row| (0..row.columns().len()).map(|i| mysql_value_to_json(row, i)).collect())
        .collect();

    let next_offset = if result_rows.len() < page_size as usize {
        None
    } else {
        Some(offset + page_size)
    };

    Ok(RowPage { columns, rows: result_rows, next_offset, total_estimate })
}

#[tauri::command]
pub async fn get_mysql_schema_full(
    tab_id: String,
    state: State<'_, AppState>,
) -> Result<MysqlSchemaSnapshot> {
    let (pool, flavor) = state.require_mysql(&tab_id)?;
    crate::db::mysql_introspect::get_mysql_schema_full(&pool, flavor).await
}


fn q(s: &str) -> String {
    format!("`{}`", s.replace('`', "``"))
}

fn mysql_json_literal(v: &JsonValue) -> String {
    match v {
        JsonValue::Null => "NULL".to_string(),
        JsonValue::Bool(b) => if *b { "1" } else { "0" }.to_string(),
        JsonValue::Number(n) => n.to_string(),
        JsonValue::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

fn mysql_literal(s: &str) -> String {
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

fn mysql_value_to_json(row: &sqlx::mysql::MySqlRow, i: usize) -> JsonValue {
    use sqlx::types::chrono::{NaiveDate, NaiveDateTime, NaiveTime};


    if let Ok(v) = row.try_get::<Option<i64>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<u64>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<i32>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }
    if let Ok(v) = row.try_get::<Option<u32>, _>(i) {
        return match v { Some(n) => JsonValue::Number(n.into()), None => JsonValue::Null };
    }


    if let Ok(v) = row.try_get::<Option<bool>, _>(i) {
        return match v { Some(b) => JsonValue::Bool(b), None => JsonValue::Null };
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
    if let Ok(v) = row.try_get::<Option<NaiveTime>, _>(i) {
        return match v { Some(t) => JsonValue::String(t.to_string()), None => JsonValue::Null };
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
