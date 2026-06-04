use crate::db::introspect::{ColumnInfo, ForeignKey, IndexInfo, SchemaSnapshot, TableSchema, TriggerSchema, ViewSchema};
use crate::error::Result;
use crate::state::MysqlFlavor;
use serde::Serialize;
use sqlx::Row;


fn col_str(row: &sqlx::mysql::MySqlRow, idx: usize) -> String {
    row.try_get::<String, _>(idx)
        .or_else(|_| {
            row.try_get::<Vec<u8>, _>(idx)
                .map(|b| String::from_utf8_lossy(&b).into_owned())
        })
        .unwrap_or_default()
}

fn col_str_opt(row: &sqlx::mysql::MySqlRow, idx: usize) -> Option<String> {
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v;
    }
    row.try_get::<Option<Vec<u8>>, _>(idx)
        .ok()
        .flatten()
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}


#[derive(Debug, Serialize, Clone)]
pub struct MysqlColumnInfo {
    pub name: String,
    pub ordinal: i32,
    pub data_type: String,
    pub column_type: String,
    pub character_max_length: Option<i64>,
    pub numeric_precision: Option<i64>,
    pub numeric_scale: Option<i64>,
    pub datetime_precision: Option<i64>,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub extra: String,
    pub comment: String,
    pub collation: Option<String>,
    pub unsigned: bool,
    pub zerofill: bool,
    pub auto_increment: bool,
    pub on_update_current_timestamp: bool,
    pub invisible: bool,
    pub generated_expression: Option<String>,
    pub generated_stored: bool,
    pub enum_values: Vec<String>,
    pub set_values: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlConstraintInfo {
    pub name: String,
    pub kind: String,
    pub columns: Vec<String>,
    pub check_expr: Option<String>,
    pub fk_ref_table: Option<String>,
    pub fk_ref_columns: Vec<String>,
    pub fk_on_update: Option<String>,
    pub fk_on_delete: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlIndexInfo {
    pub name: String,
    pub unique: bool,
    pub index_type: String,
    pub columns: Vec<MysqlIndexColumnInfo>,
    pub is_primary: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlIndexColumnInfo {
    pub column_name: String,
    pub sub_part: Option<i64>,
    pub asc: bool,
    pub expression: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlTableFullInfo {
    pub schema: String,
    pub name: String,
    pub table_type: String,
    pub engine: Option<String>,
    pub charset: Option<String>,
    pub collation: Option<String>,
    pub comment: String,
    pub auto_increment: Option<i64>,
    pub system_versioned: bool,
    pub columns: Vec<MysqlColumnInfo>,
    pub constraints: Vec<MysqlConstraintInfo>,
    pub indexes: Vec<MysqlIndexInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlViewFullInfo {
    pub schema: String,
    pub name: String,
    pub definition: String,
    pub definer: String,
    pub security_type: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlRoutineFullInfo {
    pub schema: String,
    pub name: String,
    pub routine_type: String,
    pub return_type: Option<String>,
    pub deterministic: bool,
    pub data_access: String,
    pub security_type: String,
    pub body: String,
    pub comment: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlTriggerFullInfo {
    pub schema: String,
    pub name: String,
    pub timing: String,
    pub event: String,
    pub table_name: String,
    pub statement: String,
    pub definer: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlSequenceInfo {
    pub schema: String,
    pub name: String,
    pub start_value: i64,
    pub increment: i64,
    pub min_value: i64,
    pub max_value: i64,
    pub cache_size: i64,
    pub cycle: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct MysqlSchemaSnapshot {
    pub current_database: String,
    pub available_databases: Vec<String>,
    pub tables: Vec<MysqlTableFullInfo>,
    pub views: Vec<MysqlViewFullInfo>,
    pub routines: Vec<MysqlRoutineFullInfo>,
    pub triggers: Vec<MysqlTriggerFullInfo>,
    pub sequences: Vec<MysqlSequenceInfo>,
    pub flavor: String,
}


pub async fn get_mysql_schema(pool: &sqlx::MySqlPool) -> Result<SchemaSnapshot> {
    let db = current_db(pool).await?;

    let tables = get_mysql_tables_simple(pool, &db).await?;
    let views = get_mysql_views_simple(pool).await?;
    let triggers = get_mysql_triggers_simple(pool).await?;

    Ok(SchemaSnapshot { tables, views, triggers })
}

async fn current_db(pool: &sqlx::MySqlPool) -> Result<String> {
    let row = sqlx::query("SELECT DATABASE()")
        .fetch_one(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;
    let db: Option<String> = row.try_get(0).unwrap_or(None);
    Ok(db.unwrap_or_default())
}

async fn get_mysql_tables_simple(pool: &sqlx::MySqlPool, db: &str) -> Result<Vec<TableSchema>> {


    let rows = sqlx::query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
        .fetch_all(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    let mut tables = Vec::new();
    for row in rows {
        let name = col_str(&row, 0);
        if name.is_empty() { continue; }
        let columns = get_simple_columns(pool, &name).await?;
        let indexes = get_simple_indexes(pool, &name).await?;
        let foreign_keys = get_simple_fks(pool, &name).await?;
        let row_count_estimate = get_row_count_estimate(pool, db, &name).await;
        tables.push(TableSchema { name, columns, indexes, foreign_keys, row_count_estimate, sql: String::new() });
    }
    Ok(tables)
}

async fn get_simple_columns(pool: &sqlx::MySqlPool, table: &str) -> Result<Vec<ColumnInfo>> {


    let tbl_esc = table.replace('`', "``");
    let rows = sqlx::query(&format!("SHOW COLUMNS FROM `{}`", tbl_esc))
        .fetch_all(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, r)| {
            let name      = col_str(&r, 0);
            let type_name = col_str(&r, 1);
            let nullable  = col_str(&r, 2);
            let key       = col_str(&r, 3);
            let default_value = col_str_opt(&r, 4);
            ColumnInfo {
                cid: i as i64,
                name,
                type_name,
                notnull: nullable == "NO",
                default_value,
                pk: if key == "PRI" { 1 } else { 0 },
            }
        })
        .collect())
}

async fn get_simple_indexes(pool: &sqlx::MySqlPool, table: &str) -> Result<Vec<IndexInfo>> {


    let tbl_esc = table.replace('`', "``");
    let rows = sqlx::query(&format!("SHOW INDEX FROM `{}`", tbl_esc))
        .fetch_all(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    let mut index_map: std::collections::BTreeMap<String, (bool, Vec<(i64, String)>)> =
        std::collections::BTreeMap::new();
    for row in rows {
        let key_name = col_str(&row, 2);
        if key_name == "PRIMARY" { continue; }
        let non_unique: i64 = row.try_get(1).unwrap_or(1);
        let seq: i64 = row.try_get(3).unwrap_or(0);
        let col_name = col_str(&row, 4);
        let entry = index_map.entry(key_name).or_insert((non_unique == 0, Vec::new()));
        entry.1.push((seq, col_name));
    }

    Ok(index_map
        .into_iter()
        .map(|(name, (unique, mut cols))| {
            cols.sort_by_key(|(seq, _)| *seq);
            IndexInfo { name, unique, columns: cols.into_iter().map(|(_, c)| c).collect() }
        })
        .collect())
}

async fn get_simple_fks(pool: &sqlx::MySqlPool, table: &str) -> Result<Vec<ForeignKey>> {

    let tbl_esc = table.replace('\'', "''");
    let rows = sqlx::query(&format!(
        "SELECT kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION, kcu.REFERENCED_TABLE_NAME, \
                kcu.COLUMN_NAME, kcu.REFERENCED_COLUMN_NAME, \
                rc.UPDATE_RULE, rc.DELETE_RULE \
         FROM information_schema.KEY_COLUMN_USAGE kcu \
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc \
           ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA \
          AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME \
         WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = '{}' \
           AND kcu.REFERENCED_TABLE_NAME IS NOT NULL \
         ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION",
        tbl_esc
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(|(i, r)| ForeignKey {
            id: i as i64,
            seq: r.try_get::<i64, _>(1).unwrap_or(0) - 1,
            table:     col_str(&r, 2),
            from:      col_str(&r, 3),
            to:        col_str(&r, 4),
            on_update: { let s = col_str(&r, 5); if s.is_empty() { "NO ACTION".into() } else { s } },
            on_delete: { let s = col_str(&r, 6); if s.is_empty() { "NO ACTION".into() } else { s } },
        })
        .collect())
}

async fn get_row_count_estimate(pool: &sqlx::MySqlPool, db: &str, table: &str) -> Option<i64> {


    let tbl_esc_sql = table.replace('\'', "''");
    let row = sqlx::query(&format!(
        "SELECT TABLE_ROWS FROM information_schema.TABLES \
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}'",
        tbl_esc_sql
    ))
    .fetch_one(pool)
    .await
    .ok()?;

    let estimate: Option<i64> = row.try_get::<Option<i64>, _>(0).ok().flatten();

    if let Some(n) = estimate {
        if n > 0 {
            return Some(n);
        }
    }


    let db_esc = db.replace('`', "``");
    let tbl_esc = table.replace('`', "``");
    let count_row = sqlx::query(&format!(
        "SELECT COUNT(*) FROM `{}`.`{}`",
        db_esc, tbl_esc
    ))
    .fetch_one(pool)
    .await
    .ok()?;
    count_row.try_get::<i64, _>(0).ok()
}

async fn get_mysql_views_simple(pool: &sqlx::MySqlPool) -> Result<Vec<ViewSchema>> {

    let rows = sqlx::query("SHOW FULL TABLES WHERE Table_type = 'VIEW'")
        .fetch_all(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    let mut views = Vec::new();
    for row in rows {
        let name = col_str(&row, 0);
        if name.is_empty() { continue; }

        let tbl_esc = name.replace('`', "``");
        let sql = sqlx::query(&format!("SHOW CREATE VIEW `{}`", tbl_esc))
            .fetch_one(pool)
            .await
            .ok()
            .map(|r| col_str(&r, 1))
            .unwrap_or_default();
        views.push(ViewSchema { name, sql });
    }
    Ok(views)
}

async fn get_mysql_triggers_simple(pool: &sqlx::MySqlPool) -> Result<Vec<TriggerSchema>> {

    let rows = sqlx::query("SHOW TRIGGERS")
        .fetch_all(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| TriggerSchema {
            name:       col_str(&r, 0),
            table_name: col_str(&r, 2),
            sql:        col_str(&r, 3),
        })
        .collect())
}


pub async fn get_mysql_schema_full(pool: &sqlx::MySqlPool, flavor: MysqlFlavor) -> Result<MysqlSchemaSnapshot> {
    let current_database = current_db(pool).await?;

    let available_databases = get_available_databases(pool).await?;

    let tables = get_full_tables(pool, &current_database, flavor).await?;
    let views = get_full_views(pool, &current_database).await?;
    let routines = get_full_routines(pool, &current_database).await?;
    let triggers = get_full_triggers(pool, &current_database).await?;

    let sequences = if flavor == MysqlFlavor::MariaDb {
        get_sequences(pool, &current_database).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok(MysqlSchemaSnapshot {
        current_database,
        available_databases,
        tables,
        views,
        routines,
        triggers,
        sequences,
        flavor: match flavor { MysqlFlavor::MySql => "mysql".to_string(), MysqlFlavor::MariaDb => "mariadb".to_string() },
    })
}

async fn get_available_databases(pool: &sqlx::MySqlPool) -> Result<Vec<String>> {
    let rows = sqlx::query(
        "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA \
         WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'sys', 'mysql') \
         ORDER BY SCHEMA_NAME",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows.into_iter().map(|r| col_str(&r, 0)).collect())
}

async fn get_full_tables(pool: &sqlx::MySqlPool, db: &str, flavor: MysqlFlavor) -> Result<Vec<MysqlTableFullInfo>> {
    let rows = sqlx::query(
        "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_COMMENT, AUTO_INCREMENT, \
                CREATE_OPTIONS \
         FROM information_schema.TABLES \
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' \
         ORDER BY TABLE_NAME",
    )
    .bind(db)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    let mut tables = Vec::new();
    for row in rows {
        let name: String = col_str(&row, 0);
        let engine: Option<String> = col_str_opt(&row, 1);
        let collation: Option<String> = col_str_opt(&row, 2);
        let comment: String = col_str(&row, 3);
        let auto_increment: Option<i64> = row.try_get(4).ok().flatten();
        let create_options: String = col_str(&row, 5);


        let charset = collation.as_deref().and_then(|c| c.split('_').next()).map(|s| s.to_string());
        let system_versioned = create_options.to_ascii_lowercase().contains("with system versioning");

        let columns = get_full_columns(pool, db, &name).await?;
        let constraints = get_full_constraints(pool, db, &name).await?;
        let indexes = get_full_indexes(pool, db, &name, flavor).await?;

        tables.push(MysqlTableFullInfo {
            schema: db.to_string(),
            name,
            table_type: "BASE TABLE".to_string(),
            engine,
            charset,
            collation,
            comment,
            auto_increment,
            system_versioned,
            columns,
            constraints,
            indexes,
        });
    }
    Ok(tables)
}

async fn get_full_columns(pool: &sqlx::MySqlPool, db: &str, table: &str) -> Result<Vec<MysqlColumnInfo>> {
    let rows = sqlx::query(
        "SELECT ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, \
                CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, \
                DATETIME_PRECISION, IS_NULLABLE, COLUMN_DEFAULT, \
                EXTRA, COLUMN_COMMENT, COLLATION_NAME, GENERATION_EXPRESSION \
         FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         ORDER BY ORDINAL_POSITION",
    )
    .bind(db)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let ordinal: i64 = r.try_get(0).unwrap_or(1);
            let name: String = col_str(&r, 1);
            let data_type: String = col_str(&r, 2);
            let column_type: String = col_str(&r, 3);
            let char_max: Option<i64> = r.try_get(4).ok().flatten();
            let num_prec: Option<i64> = r.try_get(5).ok().flatten();
            let num_scale: Option<i64> = r.try_get(6).ok().flatten();
            let dt_prec: Option<i64> = r.try_get(7).ok().flatten();
            let nullable: String = { let s = col_str(&r, 8); if s.is_empty() { "YES".to_string() } else { s } };
            let default_value: Option<String> = col_str_opt(&r, 9);
            let extra: String = col_str(&r, 10);
            let comment: String = col_str(&r, 11);
            let collation: Option<String> = col_str_opt(&r, 12);
            let gen_expr: Option<String> = col_str_opt(&r, 13);

            let col_type_lower = column_type.to_ascii_lowercase();
            let unsigned = col_type_lower.contains("unsigned");
            let zerofill = col_type_lower.contains("zerofill");
            let auto_increment = extra.to_ascii_lowercase().contains("auto_increment");
            let on_update = extra.to_ascii_lowercase().contains("on update current_timestamp");
            let invisible = extra.to_ascii_lowercase().contains("invisible");
            let generated_stored = extra.to_ascii_lowercase().contains("stored");

            let enum_values = if data_type.to_ascii_lowercase() == "enum" {
                parse_enum_set_values(&column_type)
            } else {
                Vec::new()
            };
            let set_values = if data_type.to_ascii_lowercase() == "set" {
                parse_enum_set_values(&column_type)
            } else {
                Vec::new()
            };

            MysqlColumnInfo {
                name,
                ordinal: ordinal as i32,
                data_type,
                column_type,
                character_max_length: char_max,
                numeric_precision: num_prec,
                numeric_scale: num_scale,
                datetime_precision: dt_prec,
                nullable: nullable.to_ascii_uppercase() == "YES",
                default_value,
                extra,
                comment,
                collation,
                unsigned,
                zerofill,
                auto_increment,
                on_update_current_timestamp: on_update,
                invisible,
                generated_expression: gen_expr,
                generated_stored,
                enum_values,
                set_values,
            }
        })
        .collect())
}

fn parse_enum_set_values(column_type: &str) -> Vec<String> {

    if let Some(start) = column_type.find('(') {
        if let Some(end) = column_type.rfind(')') {
            let inner = &column_type[start + 1..end];
            return inner
                .split(',')
                .map(|v| {
                    let t = v.trim();
                    if (t.starts_with('\'') && t.ends_with('\'')) || (t.starts_with('"') && t.ends_with('"')) {
                        t[1..t.len() - 1].replace("''", "'")
                    } else {
                        t.to_string()
                    }
                })
                .collect();
        }
    }
    Vec::new()
}

async fn get_full_constraints(pool: &sqlx::MySqlPool, db: &str, table: &str) -> Result<Vec<MysqlConstraintInfo>> {
    let rows = sqlx::query(
        "SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, \
                GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION), \
                kcu2.TABLE_NAME AS ref_table, \
                GROUP_CONCAT(DISTINCT kcu2.COLUMN_NAME ORDER BY kcu2.ORDINAL_POSITION), \
                rc.UPDATE_RULE, rc.DELETE_RULE, cc.CHECK_CLAUSE \
         FROM information_schema.TABLE_CONSTRAINTS tc \
         LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu \
           ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
          AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
          AND kcu.TABLE_NAME = tc.TABLE_NAME \
         LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu2 \
           ON kcu2.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
          AND kcu2.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
          AND kcu2.REFERENCED_TABLE_NAME IS NOT NULL \
         LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc \
           ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
          AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
         LEFT JOIN information_schema.CHECK_CONSTRAINTS cc \
           ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA \
          AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
         WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ? \
         GROUP BY tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE, \
                  kcu2.TABLE_NAME, rc.UPDATE_RULE, rc.DELETE_RULE, cc.CHECK_CLAUSE \
         ORDER BY FIELD(tc.CONSTRAINT_TYPE, 'PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK'), \
                  tc.CONSTRAINT_NAME",
    )
    .bind(db)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let name: String = col_str(&r, 0);
            let kind: String = col_str(&r, 1);
            let cols_str: String = col_str(&r, 2);
            let ref_table: Option<String> = col_str_opt(&r, 3);
            let ref_cols_str: Option<String> = col_str_opt(&r, 4);
            let on_update: Option<String> = col_str_opt(&r, 5);
            let on_delete: Option<String> = col_str_opt(&r, 6);
            let check_expr: Option<String> = col_str_opt(&r, 7);

            let columns = if cols_str.is_empty() {
                Vec::new()
            } else {
                cols_str.split(',').map(|s| s.trim().to_string()).collect()
            };
            let fk_ref_columns = ref_cols_str
                .map(|s| s.split(',').map(|c| c.trim().to_string()).collect())
                .unwrap_or_default();

            let kind_short = match kind.as_str() {
                "PRIMARY KEY" => "PRIMARY",
                "UNIQUE" => "UNIQUE",
                "FOREIGN KEY" => "FOREIGN",
                "CHECK" => "CHECK",
                other => other,
            }.to_string();

            MysqlConstraintInfo {
                name,
                kind: kind_short,
                columns,
                check_expr,
                fk_ref_table: ref_table,
                fk_ref_columns,
                fk_on_update: on_update,
                fk_on_delete: on_delete,
            }
        })
        .collect())
}


async fn get_full_indexes(pool: &sqlx::MySqlPool, db: &str, table: &str, flavor: MysqlFlavor) -> Result<Vec<MysqlIndexInfo>> {
    let include_expression = flavor == MysqlFlavor::MySql;

    let query_str = if include_expression {
        "SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, \
                GROUP_CONCAT(IFNULL(COLUMN_NAME, '') ORDER BY SEQ_IN_INDEX), \
                GROUP_CONCAT(IFNULL(SUB_PART, '') ORDER BY SEQ_IN_INDEX), \
                GROUP_CONCAT(IF(COLLATION='A', 'true', 'false') ORDER BY SEQ_IN_INDEX), \
                GROUP_CONCAT(IFNULL(EXPRESSION, '') ORDER BY SEQ_IN_INDEX) \
         FROM information_schema.STATISTICS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE \
         ORDER BY INDEX_NAME"
    } else {
        "SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, \
                GROUP_CONCAT(IFNULL(COLUMN_NAME, '') ORDER BY SEQ_IN_INDEX), \
                GROUP_CONCAT(IFNULL(SUB_PART, '') ORDER BY SEQ_IN_INDEX), \
                GROUP_CONCAT(IF(COLLATION='A', 'true', 'false') ORDER BY SEQ_IN_INDEX) \
         FROM information_schema.STATISTICS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE \
         ORDER BY INDEX_NAME"
    };

    let rows = sqlx::query(query_str)
        .bind(db)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let name: String = col_str(&r, 0);
            let non_unique: i64 = r.try_get(1).unwrap_or(1);
            let index_type: String = { let s = col_str(&r, 2); if s.is_empty() { "BTREE".to_string() } else { s } };
            let cols_str: String = col_str(&r, 3);
            let sub_parts_str: String = col_str(&r, 4);
            let asc_str: String = col_str(&r, 5);
            let expr_str: String = if include_expression { col_str(&r, 6) } else { String::new() };

            let col_names: Vec<&str> = cols_str.split(',').collect();
            let sub_parts: Vec<Option<i64>> = sub_parts_str
                .split(',')
                .map(|s| s.trim().parse::<i64>().ok())
                .collect();
            let asc_flags: Vec<bool> = asc_str
                .split(',')
                .map(|s| s.trim() == "true")
                .collect();
            let expressions: Vec<Option<String>> = expr_str
                .split(',')
                .map(|s| { let t = s.trim(); if t.is_empty() { None } else { Some(t.to_string()) } })
                .collect();

            let columns = col_names
                .into_iter()
                .enumerate()
                .map(|(i, col)| MysqlIndexColumnInfo {
                    column_name: col.to_string(),
                    sub_part: sub_parts.get(i).copied().flatten(),
                    asc: *asc_flags.get(i).unwrap_or(&true),
                    expression: expressions.get(i).cloned().flatten(),
                })
                .collect();

            let is_primary = name == "PRIMARY";
            MysqlIndexInfo {
                name,
                unique: non_unique == 0,
                index_type,
                columns,
                is_primary,
            }
        })
        .collect())
}

async fn get_full_views(pool: &sqlx::MySqlPool, db: &str) -> Result<Vec<MysqlViewFullInfo>> {
    let rows = sqlx::query(
        "SELECT TABLE_NAME, VIEW_DEFINITION, DEFINER, SECURITY_TYPE \
         FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
    )
    .bind(db)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| MysqlViewFullInfo {
            schema: db.to_string(),
            name: col_str(&r, 0),
            definition: col_str(&r, 1),
            definer: col_str(&r, 2),
            security_type: col_str(&r, 3),
        })
        .collect())
}

async fn get_full_routines(pool: &sqlx::MySqlPool, db: &str) -> Result<Vec<MysqlRoutineFullInfo>> {
    let rows = sqlx::query(
        "SELECT ROUTINE_NAME, ROUTINE_TYPE, DTD_IDENTIFIER, IS_DETERMINISTIC, \
                SQL_DATA_ACCESS, SECURITY_TYPE, ROUTINE_DEFINITION, ROUTINE_COMMENT \
         FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_TYPE, ROUTINE_NAME",
    )
    .bind(db)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let deterministic: String = { let s = col_str(&r, 3); if s.is_empty() { "NO".to_string() } else { s } };
            MysqlRoutineFullInfo {
                schema: db.to_string(),
                name: col_str(&r, 0),
                routine_type: col_str(&r, 1),
                return_type: col_str_opt(&r, 2),
                deterministic: deterministic.to_ascii_uppercase() == "YES",
                data_access: col_str(&r, 4),
                security_type: col_str(&r, 5),
                body: col_str(&r, 6),
                comment: col_str(&r, 7),
            }
        })
        .collect())
}

async fn get_full_triggers(pool: &sqlx::MySqlPool, db: &str) -> Result<Vec<MysqlTriggerFullInfo>> {
    let rows = sqlx::query(
        "SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, \
                EVENT_OBJECT_TABLE, ACTION_STATEMENT, DEFINER \
         FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME",
    )
    .bind(db)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| MysqlTriggerFullInfo {
            schema: db.to_string(),
            name: col_str(&r, 0),
            timing: col_str(&r, 1),
            event: col_str(&r, 2),
            table_name: col_str(&r, 3),
            statement: col_str(&r, 4),
            definer: col_str(&r, 5),
        })
        .collect())
}

async fn get_sequences(pool: &sqlx::MySqlPool, db: &str) -> Result<Vec<MysqlSequenceInfo>> {

    let rows = sqlx::query(
        "SELECT SEQUENCE_NAME, START_VALUE, INCREMENT, MINIMUM_VALUE, \
                MAXIMUM_VALUE, CACHE_SIZE, CYCLE_OPTION \
         FROM information_schema.SEQUENCES WHERE SEQUENCE_SCHEMA = ? ORDER BY SEQUENCE_NAME",
    )
    .bind(db)
    .fetch_all(pool)
    .await
    .map_err(|e| crate::error::Error::Mysql(e.to_string()))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let cycle_opt: String = col_str(&r, 6);
            MysqlSequenceInfo {
                schema: db.to_string(),
                name: col_str(&r, 0),
                start_value: r.try_get(1).unwrap_or(1),
                increment: r.try_get(2).unwrap_or(1),
                min_value: r.try_get(3).unwrap_or(1),
                max_value: r.try_get(4).unwrap_or(i64::MAX),
                cache_size: r.try_get(5).unwrap_or(1000),
                cycle: cycle_opt.to_ascii_uppercase() == "YES" || cycle_opt == "1",
            }
        })
        .collect())
}
