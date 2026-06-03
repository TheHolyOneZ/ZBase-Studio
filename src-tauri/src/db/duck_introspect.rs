use crate::db::introspect::{ColumnInfo, SchemaSnapshot, TableSchema, TriggerSchema, ViewSchema};
use crate::error::Result;

pub fn get_duck_schema(conn: &duckdb::Connection) -> Result<SchemaSnapshot> {
    let tables = get_duck_tables(conn)?;
    let views = get_duck_views(conn)?;
    Ok(SchemaSnapshot { tables, views, triggers: Vec::<TriggerSchema>::new() })
}

fn get_duck_tables(conn: &duckdb::Connection) -> Result<Vec<TableSchema>> {
    let mut stmt = conn.prepare(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema = 'main' AND table_type = 'BASE TABLE' \
         ORDER BY table_name",
    )?;
    stmt.execute([])?;
    let names: Vec<String> = {
        let mut rows = stmt.query([])?;
        let mut names = Vec::new();
        while let Some(row) = rows.next()? {
            let name: String = row.get(0)?;
            names.push(name);
        }
        names
    };

    let mut tables = Vec::new();
    for name in names {
        let columns = get_duck_columns(conn, &name)?;
        let row_count_estimate = get_duck_row_count(conn, &name);
        tables.push(TableSchema {
            name,
            columns,
            indexes: vec![],
            foreign_keys: vec![],
            row_count_estimate,
        });
    }
    Ok(tables)
}

fn get_duck_columns(conn: &duckdb::Connection, table: &str) -> Result<Vec<ColumnInfo>> {
    let sql = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
    let mut stmt = conn.prepare(&sql)?;
    stmt.execute([])?;
    let mut rows = stmt.query([])?;
    let mut cols = Vec::new();
    while let Some(row) = rows.next()? {

        let get_bool_or_int = |idx: usize| -> std::result::Result<bool, duckdb::Error> {
            row.get::<_, bool>(idx)
                .or_else(|_| row.get::<_, i64>(idx).map(|v| v != 0))
        };
        let notnull = get_bool_or_int(3)?;
        let pk_bool = get_bool_or_int(5)?;
        cols.push(ColumnInfo {
            cid: row.get::<_, i64>(0)?,
            name: row.get::<_, String>(1)?,
            type_name: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            notnull,
            default_value: row.get::<_, Option<String>>(4)?,
            pk: if pk_bool { 1 } else { 0 },
        });
    }
    Ok(cols)
}

fn get_duck_row_count(conn: &duckdb::Connection, table: &str) -> Option<i64> {
    conn.query_row(
        &format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\"")),
        [],
        |r| r.get::<_, i64>(0),
    )
    .ok()
}

fn get_duck_views(conn: &duckdb::Connection) -> Result<Vec<ViewSchema>> {

    let result = try_get_views_from_duckdb_views(conn);
    if result.is_ok() {
        return result;
    }
    get_views_from_information_schema(conn)
}

fn try_get_views_from_duckdb_views(conn: &duckdb::Connection) -> Result<Vec<ViewSchema>> {
    let mut stmt = conn.prepare(
        "SELECT view_name, sql FROM duckdb_views() WHERE schema_name = 'main' ORDER BY view_name",
    )?;
    stmt.execute([])?;
    let mut rows = stmt.query([])?;
    let mut views = Vec::new();
    while let Some(row) = rows.next()? {
        views.push(ViewSchema {
            name: row.get::<_, String>(0)?,
            sql: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        });
    }
    Ok(views)
}

fn get_views_from_information_schema(conn: &duckdb::Connection) -> Result<Vec<ViewSchema>> {
    let mut stmt = conn.prepare(
        "SELECT table_name, view_definition FROM information_schema.views \
         WHERE table_schema = 'main' ORDER BY table_name",
    )?;
    stmt.execute([])?;
    let mut rows = stmt.query([])?;
    let mut views = Vec::new();
    while let Some(row) = rows.next()? {
        views.push(ViewSchema {
            name: row.get::<_, String>(0)?,
            sql: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        });
    }
    Ok(views)
}
