use crate::db::types::value_to_json;
use crate::error::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnMeta {
    pub name: String,
    pub decl_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RowPage {
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Vec<JsonValue>>,
    pub next_offset: Option<i64>,
    pub total_estimate: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RowFilter {
    pub column: String,
    pub op: String,
    pub value: JsonValue,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SortSpec {
    pub column: String,
    pub desc: bool,
}

pub fn read_rows(
    conn: &Connection,
    table: &str,
    offset: i64,
    page_size: i64,
    filters: &[RowFilter],
    sort: Option<&SortSpec>,
) -> Result<RowPage> {
    let total_estimate = get_count(conn, table, filters)?;

    let mut sql = format!("SELECT * FROM \"{}\"", table.replace('"', "\"\""));
    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    if !filters.is_empty() {
        sql.push_str(" WHERE ");
        let clauses: Vec<String> = filters
            .iter()
            .map(|f| {
                let col = f.column.replace('"', "\"\"");
                match f.op.as_str() {
                    "=" | "!=" | "<" | ">" | "<=" | ">=" => {
                        params.push(crate::db::types::json_to_value(f.value.clone()));
                        format!("\"{}\" {} ?", col, f.op)
                    }
                    "like" => {
                        params.push(crate::db::types::json_to_value(f.value.clone()));
                        format!("\"{}\" LIKE ?", col)
                    }
                    "is_null" => format!("\"{}\" IS NULL", col),
                    "not_null" => format!("\"{}\" IS NOT NULL", col),
                    _ => "1=1".to_string(),
                }
            })
            .collect();
        sql.push_str(&clauses.join(" AND "));
    }

    if let Some(s) = sort {
        sql.push_str(&format!(
            " ORDER BY \"{}\" {}",
            s.column.replace('"', "\"\""),
            if s.desc { "DESC" } else { "ASC" }
        ));
    }

    sql.push_str(&format!(" LIMIT {} OFFSET {}", page_size, offset));

    let mut stmt = conn.prepare(&sql)?;
    let col_count = stmt.column_count();

    let columns: Vec<ColumnMeta> = stmt
        .columns()
        .into_iter()
        .map(|c| ColumnMeta {
            name: c.name().to_string(),
            decl_type: c.decl_type().unwrap_or("").to_string(),
        })
        .collect();

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();

    let rows: Vec<Vec<JsonValue>> = stmt
        .query_map(param_refs.as_slice(), |row| {
            let cells: Vec<JsonValue> = (0..col_count)
                .map(|i| value_to_json(row.get::<_, rusqlite::types::Value>(i).unwrap_or(rusqlite::types::Value::Null)))
                .collect();
            Ok(cells)
        })?
        .filter_map(|r| r.ok())
        .collect();

    let next_offset = if offset + page_size < total_estimate {
        Some(offset + page_size)
    } else {
        None
    };

    Ok(RowPage { columns, rows, next_offset, total_estimate })
}

fn get_count(conn: &Connection, table: &str, filters: &[RowFilter]) -> Result<i64> {
    let mut sql = format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\""));
    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    if !filters.is_empty() {
        sql.push_str(" WHERE ");
        let clauses: Vec<String> = filters
            .iter()
            .map(|f| {
                let col = f.column.replace('"', "\"\"");
                match f.op.as_str() {
                    "=" | "!=" | "<" | ">" | "<=" | ">=" => {
                        params.push(crate::db::types::json_to_value(f.value.clone()));
                        format!("\"{}\" {} ?", col, f.op)
                    }
                    "like" => {
                        params.push(crate::db::types::json_to_value(f.value.clone()));
                        format!("\"{}\" LIKE ?", col)
                    }
                    "is_null" => format!("\"{}\" IS NULL", col),
                    "not_null" => format!("\"{}\" IS NOT NULL", col),
                    _ => "1=1".to_string(),
                }
            })
            .collect();
        sql.push_str(&clauses.join(" AND "));
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();

    let count: i64 = conn.query_row(&sql, param_refs.as_slice(), |r| r.get(0))?;
    Ok(count)
}
