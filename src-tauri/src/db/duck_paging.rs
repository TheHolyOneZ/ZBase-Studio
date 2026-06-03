use crate::db::duck_types::duck_value_to_json;
use crate::db::paging::{ColumnMeta, RowFilter, RowPage, SortSpec};
use crate::error::Result;
use duckdb::types::Value as DuckValue;
use serde_json::Value as JsonValue;

fn json_to_sql_lit(v: &JsonValue) -> String {
    match v {
        JsonValue::Null => "NULL".to_string(),
        JsonValue::Bool(b) => if *b { "TRUE" } else { "FALSE" }.to_string(),
        JsonValue::Number(n) => n.to_string(),
        JsonValue::String(s) => format!("'{}'", s.replace('\'', "''")),
        _ => "NULL".to_string(),
    }
}

pub fn read_rows_duck(
    conn: &duckdb::Connection,
    table: &str,
    offset: i64,
    page_size: i64,
    filters: &[RowFilter],
    sort: Option<&SortSpec>,
) -> Result<RowPage> {
    let total_estimate = get_duck_count(conn, table, filters)?;

    let mut sql = format!("SELECT * FROM \"{}\"", table.replace('"', "\"\""));

    if !filters.is_empty() {
        sql.push_str(" WHERE ");
        let clauses: Vec<String> = filters
            .iter()
            .map(|f| {
                let col = f.column.replace('"', "\"\"");
                match f.op.as_str() {
                    "=" | "!=" | "<" | ">" | "<=" | ">=" => {
                        format!("\"{}\" {} {}", col, f.op, json_to_sql_lit(&f.value))
                    }
                    "like" => format!("\"{}\" LIKE {}", col, json_to_sql_lit(&f.value)),
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
    let mut rows_result = stmt.query([])?;

    let col_count = rows_result
        .as_ref()
        .map(|s| s.column_count())
        .unwrap_or(0);

    let columns: Vec<ColumnMeta> = rows_result
        .as_ref()
        .map(|s| {
            (0..col_count)
                .map(|i| ColumnMeta {
                    name: s.column_name(i).map(|n| n.clone()).unwrap_or_default(),
                    decl_type: String::new(),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut rows = Vec::new();
    while let Some(row) = rows_result.next()? {
        let cells: Vec<JsonValue> = (0..col_count)
            .map(|i| duck_value_to_json(row.get::<_, DuckValue>(i).unwrap_or(DuckValue::Null)))
            .collect();
        rows.push(cells);
    }

    let next_offset = if offset + page_size < total_estimate {
        Some(offset + page_size)
    } else {
        None
    };

    Ok(RowPage { columns, rows, next_offset, total_estimate })
}

fn get_duck_count(conn: &duckdb::Connection, table: &str, filters: &[RowFilter]) -> Result<i64> {
    let mut sql = format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\""));

    if !filters.is_empty() {
        sql.push_str(" WHERE ");
        let clauses: Vec<String> = filters
            .iter()
            .map(|f| {
                let col = f.column.replace('"', "\"\"");
                match f.op.as_str() {
                    "=" | "!=" | "<" | ">" | "<=" | ">=" => {
                        format!("\"{}\" {} {}", col, f.op, json_to_sql_lit(&f.value))
                    }
                    "like" => format!("\"{}\" LIKE {}", col, json_to_sql_lit(&f.value)),
                    "is_null" => format!("\"{}\" IS NULL", col),
                    "not_null" => format!("\"{}\" IS NOT NULL", col),
                    _ => "1=1".to_string(),
                }
            })
            .collect();
        sql.push_str(&clauses.join(" AND "));
    }

    let count: i64 = conn.query_row(&sql, [], |r| r.get(0))?;
    Ok(count)
}
