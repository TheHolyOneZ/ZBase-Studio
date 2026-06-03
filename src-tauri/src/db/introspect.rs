use crate::error::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub cid: i64,
    pub name: String,
    pub type_name: String,
    pub notnull: bool,
    pub default_value: Option<String>,
    pub pk: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub unique: bool,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKey {
    pub id: i64,
    pub seq: i64,
    pub table: String,
    pub from: String,
    pub to: String,
    pub on_update: String,
    pub on_delete: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableSchema {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub foreign_keys: Vec<ForeignKey>,
    pub row_count_estimate: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewSchema {
    pub name: String,
    pub sql: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerSchema {
    pub name: String,
    pub table_name: String,
    pub sql: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaSnapshot {
    pub tables: Vec<TableSchema>,
    pub views: Vec<ViewSchema>,
    pub triggers: Vec<TriggerSchema>,
}

pub fn get_schema(conn: &Connection) -> Result<SchemaSnapshot> {
    let tables = get_tables(conn)?;
    let views = get_views(conn)?;
    let triggers = get_triggers(conn)?;
    Ok(SchemaSnapshot { tables, views, triggers })
}

fn get_tables(conn: &Connection) -> Result<Vec<TableSchema>> {
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )?;
    let names: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tables = Vec::new();
    for name in names {
        let columns = get_columns(conn, &name)?;
        let indexes = get_indexes(conn, &name)?;
        let foreign_keys = get_foreign_keys(conn, &name)?;
        let row_count_estimate = get_row_count_estimate(conn, &name);
        tables.push(TableSchema { name, columns, indexes, foreign_keys, row_count_estimate });
    }
    Ok(tables)
}

fn get_columns(conn: &Connection, table: &str) -> Result<Vec<ColumnInfo>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")))?;
    let cols = stmt
        .query_map([], |r| {
            Ok(ColumnInfo {
                cid: r.get(0)?,
                name: r.get(1)?,
                type_name: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                notnull: r.get::<_, i32>(3)? != 0,
                default_value: r.get(4)?,
                pk: r.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(cols)
}

fn get_indexes(conn: &Connection, table: &str) -> Result<Vec<IndexInfo>> {
    let mut stmt = conn.prepare(&format!("PRAGMA index_list(\"{}\")", table.replace('"', "\"\"")))?;
    let index_rows: Vec<(String, bool)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i32>(3)? != 0)))?
        .filter_map(|r| r.ok())
        .collect();

    let mut indexes = Vec::new();
    for (idx_name, unique) in index_rows {
        let mut info_stmt =
            conn.prepare(&format!("PRAGMA index_info(\"{}\")", idx_name.replace('"', "\"\"")))?;
        let columns: Vec<String> = info_stmt
            .query_map([], |r| r.get::<_, Option<String>>(2))?
            .filter_map(|r| r.ok().and_then(|v| v))
            .collect();
        indexes.push(IndexInfo { name: idx_name, unique, columns });
    }
    Ok(indexes)
}

fn get_foreign_keys(conn: &Connection, table: &str) -> Result<Vec<ForeignKey>> {
    let mut stmt =
        conn.prepare(&format!("PRAGMA foreign_key_list(\"{}\")", table.replace('"', "\"\"")))?;
    let fks = stmt
        .query_map([], |r| {
            Ok(ForeignKey {
                id: r.get(0)?,
                seq: r.get(1)?,
                table: r.get(2)?,
                from: r.get(3)?,
                to: r.get(4)?,
                on_update: r.get(5)?,
                on_delete: r.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(fks)
}

fn get_row_count_estimate(conn: &Connection, table: &str) -> Option<i64> {
    conn.query_row(
        &format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\"")),
        [],
        |r| r.get(0),
    )
    .ok()
}

fn get_views(conn: &Connection) -> Result<Vec<ViewSchema>> {
    let mut stmt = conn.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='view' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )?;
    let views = stmt
        .query_map([], |r| {
            Ok(ViewSchema {
                name: r.get(0)?,
                sql: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(views)
}

fn get_triggers(conn: &Connection) -> Result<Vec<TriggerSchema>> {
    let mut stmt = conn.prepare(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name",
    )?;
    let triggers = stmt
        .query_map([], |r| {
            Ok(TriggerSchema {
                name: r.get(0)?,
                table_name: r.get(1)?,
                sql: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(triggers)
}
