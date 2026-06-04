use crate::db::introspect::{ColumnInfo, ForeignKey, IndexInfo, SchemaSnapshot, TableSchema, TriggerSchema, ViewSchema};
use crate::error::Result;
use serde::Serialize;
use sqlx::Row;


#[derive(Debug, Serialize, Clone)]
pub struct PgColumnInfo {
    pub name: String,
    pub ordinal: i32,
    pub udt_name: String,
    pub data_type: String,
    pub character_max_length: Option<i32>,
    pub numeric_precision: Option<i32>,
    pub numeric_scale: Option<i32>,
    pub is_array: bool,
    pub not_null: bool,
    pub default_value: Option<String>,
    pub is_identity: bool,
    pub identity_generation: Option<String>,
    pub collation: Option<String>,
    pub comment: Option<String>,
    pub generated_expression: Option<String>,
    pub generated_stored: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgConstraintInfo {
    pub name: String,
    pub kind: String,
    pub columns: Vec<String>,
    pub check_expr: Option<String>,
    pub fk_ref_schema: Option<String>,
    pub fk_ref_table: Option<String>,
    pub fk_ref_columns: Option<Vec<String>>,
    pub fk_on_update: Option<String>,
    pub fk_on_delete: Option<String>,
    pub deferrable: bool,
    pub initially_deferred: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgIndexColumnInfo {
    pub expr: String,
    pub direction: String,
    pub nulls: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgIndexFullInfo {
    pub name: String,
    pub unique: bool,
    pub method: String,
    pub columns: Vec<PgIndexColumnInfo>,
    pub where_clause: Option<String>,
    pub is_primary: bool,
    pub is_unique_constraint: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgTableFullInfo {
    pub schema: String,
    pub name: String,
    pub kind: String,
    pub comment: Option<String>,
    pub columns: Vec<PgColumnInfo>,
    pub constraints: Vec<PgConstraintInfo>,
    pub indexes: Vec<PgIndexFullInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgFunctionFullInfo {
    pub schema: String,
    pub name: String,
    pub language: String,
    pub returns_trigger: bool,
    pub parameters: String,
    pub body: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgEnumFullInfo {
    pub schema: String,
    pub name: String,
    pub values: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgTriggerFullInfo {
    pub schema: String,
    pub name: String,
    pub table_schema: String,
    pub table: String,
    pub timing: String,
    pub events: Vec<String>,
    pub for_each: String,
    pub when_clause: Option<String>,
    pub function_schema: String,
    pub function_name: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgViewFullInfo {
    pub schema: String,
    pub name: String,
    pub definition: String,
    pub materialized: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct PgSchemaSnapshot {
    pub default_schema: String,
    pub available_schemas: Vec<String>,
    pub tables: Vec<PgTableFullInfo>,
    pub views: Vec<PgViewFullInfo>,
    pub functions: Vec<PgFunctionFullInfo>,
    pub triggers: Vec<PgTriggerFullInfo>,
    pub enums: Vec<PgEnumFullInfo>,
}

pub async fn get_pg_schema(pool: &sqlx::PgPool) -> Result<SchemaSnapshot> {
    let tables = get_pg_tables(pool).await?;
    let views = get_pg_views(pool).await?;
    Ok(SchemaSnapshot { tables, views, triggers: Vec::<TriggerSchema>::new() })
}

async fn get_pg_tables(pool: &sqlx::PgPool) -> Result<Vec<TableSchema>> {
    let names: Vec<String> = sqlx::query(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE' \
         ORDER BY table_name",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| r.try_get::<String, _>(0).unwrap_or_default())
    .collect();

    let mut tables = Vec::new();
    for name in names {
        let columns = get_pg_columns(pool, &name).await?;
        let indexes = get_pg_indexes(pool, &name).await?;
        let foreign_keys = get_pg_fks(pool, &name).await?;
        let row_count_estimate = get_pg_row_count(pool, &name).await;
        tables.push(TableSchema { name, columns, indexes, foreign_keys, row_count_estimate, sql: String::new() });
    }
    Ok(tables)
}

async fn get_pg_columns(pool: &sqlx::PgPool, table: &str) -> Result<Vec<ColumnInfo>> {
    let pk_cols: Vec<String> = sqlx::query(
        "SELECT kcu.column_name \
         FROM information_schema.key_column_usage kcu \
         JOIN information_schema.table_constraints tc \
           ON tc.constraint_name = kcu.constraint_name \
              AND tc.table_schema = kcu.table_schema \
         WHERE tc.constraint_type = 'PRIMARY KEY' \
           AND kcu.table_schema = 'public' \
           AND kcu.table_name = $1 \
         ORDER BY kcu.ordinal_position",
    )
    .bind(table)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| r.try_get::<String, _>(0).unwrap_or_default())
    .collect();

    let rows = sqlx::query(
        "SELECT \
            (ordinal_position - 1)::bigint, \
            column_name, \
            udt_name, \
            is_nullable, \
            column_default \
         FROM information_schema.columns \
         WHERE table_schema = 'public' AND table_name = $1 \
         ORDER BY ordinal_position",
    )
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut cols = Vec::new();
    for row in rows {
        let cid: i64 = row.try_get(0).unwrap_or(0);
        let col_name: String = row.try_get(1).unwrap_or_default();
        let type_name: String = row.try_get(2).unwrap_or_default();
        let is_nullable: String = row.try_get(3).unwrap_or_else(|_| "YES".into());
        let default_value: Option<String> = row.try_get(4).unwrap_or(None);

        let notnull = is_nullable == "NO";
        let pk_pos = pk_cols.iter().position(|c| c == &col_name);
        let pk = pk_pos.map(|p| (p + 1) as i64).unwrap_or(0);

        cols.push(ColumnInfo { cid, name: col_name, type_name, notnull, default_value, pk });
    }
    Ok(cols)
}

async fn get_pg_indexes(pool: &sqlx::PgPool, table: &str) -> Result<Vec<IndexInfo>> {
    let rows = sqlx::query(
        "SELECT i.relname, ix.indisunique, \
            array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) \
         FROM pg_class t \
         JOIN pg_index ix ON t.oid = ix.indrelid \
         JOIN pg_class i ON i.oid = ix.indexrelid \
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) \
         JOIN pg_namespace n ON n.oid = t.relnamespace \
         WHERE n.nspname = 'public' AND t.relname = $1 AND NOT ix.indisprimary \
         GROUP BY i.relname, ix.indisunique \
         ORDER BY i.relname",
    )
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut indexes = Vec::new();
    for row in rows {
        let name: String = row.try_get(0).unwrap_or_default();
        let unique: bool = row.try_get(1).unwrap_or(false);
        let columns: Vec<String> = row.try_get(2).unwrap_or_default();
        indexes.push(IndexInfo { name, unique, columns });
    }
    Ok(indexes)
}

async fn get_pg_fks(pool: &sqlx::PgPool, table: &str) -> Result<Vec<ForeignKey>> {
    let rows = sqlx::query(
        "SELECT \
            kcu.column_name, \
            ccu.table_name, \
            ccu.column_name, \
            rc.update_rule, \
            rc.delete_rule \
         FROM information_schema.referential_constraints rc \
         JOIN information_schema.key_column_usage kcu \
           ON rc.constraint_name = kcu.constraint_name \
              AND rc.constraint_schema = kcu.constraint_schema \
         JOIN information_schema.constraint_column_usage ccu \
           ON rc.unique_constraint_name = ccu.constraint_name \
              AND rc.constraint_schema = ccu.table_schema \
         WHERE kcu.table_schema = 'public' AND kcu.table_name = $1 \
         ORDER BY kcu.ordinal_position",
    )
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut fks = Vec::new();
    for (idx, row) in rows.into_iter().enumerate() {
        let from: String = row.try_get(0).unwrap_or_default();
        let to_table: String = row.try_get(1).unwrap_or_default();
        let to: String = row.try_get(2).unwrap_or_default();
        let on_update: String = row.try_get(3).unwrap_or_else(|_| "NO ACTION".into());
        let on_delete: String = row.try_get(4).unwrap_or_else(|_| "NO ACTION".into());
        fks.push(ForeignKey {
            id: idx as i64,
            seq: 0,
            table: to_table,
            from,
            to,
            on_update,
            on_delete,
        });
    }
    Ok(fks)
}

async fn get_pg_row_count(pool: &sqlx::PgPool, table: &str) -> Option<i64> {


    let row = sqlx::query(
        "SELECT reltuples::bigint FROM pg_class \
         WHERE relname = $1 AND relnamespace = 'public'::regnamespace",
    )
    .bind(table)
    .fetch_one(pool)
    .await
    .ok()?;
    let estimate: i64 = row.try_get(0).ok()?;

    if estimate >= 0 {
        return Some(estimate);
    }


    use sqlx::Row as _;
    let count_row = sqlx::query(&format!(
        "SELECT COUNT(*) FROM \"{}\"",
        table.replace('"', "\"\"")
    ))
    .fetch_one(pool)
    .await
    .ok()?;
    count_row.try_get::<i64, _>(0).ok()
}

async fn get_pg_views(pool: &sqlx::PgPool) -> Result<Vec<ViewSchema>> {
    let rows = sqlx::query(
        "SELECT table_name, view_definition \
         FROM information_schema.views \
         WHERE table_schema = 'public' \
         ORDER BY table_name",
    )
    .fetch_all(pool)
    .await?;

    let views = rows
        .into_iter()
        .map(|r| ViewSchema {
            name: r.try_get(0).unwrap_or_default(),
            sql: r.try_get::<Option<String>, _>(1).unwrap_or(None).unwrap_or_default(),
        })
        .collect();
    Ok(views)
}


pub async fn get_pg_schema_full(pool: &sqlx::PgPool) -> Result<PgSchemaSnapshot> {
    let default_schema = sqlx::query("SELECT current_schema()")
        .fetch_one(pool)
        .await
        .and_then(|r| r.try_get::<String, _>(0))
        .unwrap_or_else(|_| "public".to_string());

    let schema_rows = sqlx::query(
        "SELECT nspname FROM pg_namespace \
         WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast') \
           AND nspname NOT LIKE 'pg_temp_%' \
           AND nspname NOT LIKE 'pg_toast_temp_%' \
         ORDER BY nspname",
    )
    .fetch_all(pool)
    .await?;
    let available_schemas: Vec<String> = schema_rows
        .iter()
        .map(|r| r.try_get::<String, _>(0).unwrap_or_default())
        .collect();

    let tables = get_pg_tables_full(pool, &available_schemas).await?;
    let views = get_pg_views_full(pool, &available_schemas).await?;
    let functions = get_pg_functions_full(pool, &available_schemas).await?;
    let triggers = get_pg_triggers_full(pool, &available_schemas).await?;
    let enums = get_pg_enums_full(pool, &available_schemas).await?;

    Ok(PgSchemaSnapshot { default_schema, available_schemas, tables, views, functions, triggers, enums })
}

async fn get_pg_tables_full(pool: &sqlx::PgPool, schemas: &[String]) -> Result<Vec<PgTableFullInfo>> {
    if schemas.is_empty() { return Ok(vec![]); }
    let schema_list = schemas.iter()
        .map(|s| format!("'{}'", s.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let rows = sqlx::query(&format!(
        "SELECT n.nspname, c.relname, c.relpersistence, \
                obj_description(c.oid, 'pg_class') \
         FROM pg_class c \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE c.relkind IN ('r','p') AND n.nspname IN ({schema_list}) \
         ORDER BY n.nspname, c.relname",
    ))
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();
    for row in rows {
        let schema: String = row.try_get(0).unwrap_or_default();
        let name: String = row.try_get(1).unwrap_or_default();
        let persistence: String = row.try_get(2).unwrap_or_else(|_| "p".to_string());
        let comment: Option<String> = row.try_get(3).unwrap_or(None);
        let kind = match persistence.as_str() {
            "u" => "u",
            "t" => "t",
            _ => "r",
        }.to_string();

        let columns = get_pg_columns_full(pool, &schema, &name).await?;
        let constraints = get_pg_constraints_full(pool, &schema, &name).await?;
        let indexes = get_pg_indexes_full(pool, &schema, &name).await?;
        tables.push(PgTableFullInfo { schema, name, kind, comment, columns, constraints, indexes });
    }
    Ok(tables)
}

async fn get_pg_columns_full(pool: &sqlx::PgPool, schema: &str, table: &str) -> Result<Vec<PgColumnInfo>> {
    let rows = sqlx::query(
        "SELECT \
            a.attnum::integer - 1 AS ordinal, \
            a.attname, \
            t.typname AS udt_name, \
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, \
            CASE WHEN t.typname = 'varchar' OR t.typname = 'bpchar' \
                 THEN (a.atttypmod - 4)::integer ELSE NULL END AS char_max, \
            CASE WHEN t.typname = 'numeric' THEN ((a.atttypmod - 4) >> 16)::integer ELSE NULL END AS num_prec, \
            CASE WHEN t.typname = 'numeric' THEN ((a.atttypmod - 4) & 65535)::integer ELSE NULL END AS num_scale, \
            a.attndims > 0 AS is_array, \
            a.attnotnull, \
            CASE WHEN a.attgenerated = '' OR a.attgenerated IS NULL \
                 THEN pg_get_expr(d.adbin, d.adrelid) ELSE NULL END AS default_val, \
            a.attidentity != '' AS is_identity, \
            CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE NULL END, \
            col_description(a.attrelid, a.attnum), \
            CASE WHEN co.collname IS NOT NULL AND co.collname != 'default' THEN co.collname ELSE NULL END, \
            CASE WHEN a.attgenerated = 's' THEN pg_get_expr(d.adbin, d.adrelid) ELSE NULL END AS gen_expr, \
            a.attgenerated = 's' AS gen_stored \
         FROM pg_attribute a \
         JOIN pg_class c ON c.oid = a.attrelid \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         JOIN pg_type t ON t.oid = a.atttypid \
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum \
         LEFT JOIN pg_collation co ON co.oid = a.attcollation AND co.collname != 'default' \
         WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped \
         ORDER BY a.attnum",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut cols = Vec::new();
    for row in rows {
        let ordinal: i32 = row.try_get(0).unwrap_or(0);
        let name: String = row.try_get(1).unwrap_or_default();
        let udt_name: String = row.try_get(2).unwrap_or_default();
        let data_type: String = row.try_get(3).unwrap_or_default();
        let character_max_length: Option<i32> = row.try_get(4).unwrap_or(None);
        let numeric_precision: Option<i32> = row.try_get(5).unwrap_or(None);
        let numeric_scale: Option<i32> = row.try_get(6).unwrap_or(None);
        let is_array: bool = row.try_get(7).unwrap_or(false);
        let not_null: bool = row.try_get(8).unwrap_or(false);
        let default_value: Option<String> = row.try_get(9).unwrap_or(None);
        let is_identity: bool = row.try_get(10).unwrap_or(false);
        let identity_generation: Option<String> = row.try_get(11).unwrap_or(None);
        let comment: Option<String> = row.try_get(12).unwrap_or(None);
        let collation: Option<String> = row.try_get(13).unwrap_or(None);
        let generated_expression: Option<String> = row.try_get(14).unwrap_or(None);
        let generated_stored: bool = row.try_get(15).unwrap_or(false);

        cols.push(PgColumnInfo {
            name, ordinal, udt_name, data_type,
            character_max_length, numeric_precision, numeric_scale,
            is_array, not_null, default_value, is_identity, identity_generation,
            collation, comment, generated_expression, generated_stored,
        });
    }
    Ok(cols)
}

async fn get_pg_constraints_full(pool: &sqlx::PgPool, schema: &str, table: &str) -> Result<Vec<PgConstraintInfo>> {
    let rows = sqlx::query(
        "SELECT \
            con.conname, \
            con.contype::text, \
            ARRAY(SELECT a.attname FROM pg_attribute a \
                  WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey) \
                  ORDER BY array_position(con.conkey, a.attnum)) AS cols, \
            pg_get_constraintdef(con.oid) AS def, \
            fn.nspname AS fk_ref_schema, \
            fc.relname AS fk_ref_table, \
            ARRAY(SELECT a.attname FROM pg_attribute a \
                  WHERE a.attrelid = con.confrelid AND a.attnum = ANY(con.confkey) \
                  ORDER BY array_position(con.confkey, a.attnum)) AS fk_ref_cols, \
            CASE con.confupdtype \
                WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' \
                WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' \
            END AS on_update, \
            CASE con.confdeltype \
                WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' \
                WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' \
            END AS on_delete, \
            con.condeferrable, \
            con.condeferred \
         FROM pg_constraint con \
         JOIN pg_class tc ON tc.oid = con.conrelid \
         JOIN pg_namespace tn ON tn.oid = tc.relnamespace \
         LEFT JOIN pg_class fc ON fc.oid = con.confrelid \
         LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace \
         WHERE tn.nspname = $1 AND tc.relname = $2 \
         ORDER BY con.contype, con.conname",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut constraints = Vec::new();
    for row in rows {
        let name: String = row.try_get(0).unwrap_or_default();
        let kind: String = row.try_get(1).unwrap_or_default();
        let columns: Vec<String> = row.try_get(2).unwrap_or_default();
        let def: String = row.try_get(3).unwrap_or_default();
        let fk_ref_schema: Option<String> = row.try_get(4).unwrap_or(None);
        let fk_ref_table: Option<String> = row.try_get(5).unwrap_or(None);
        let fk_ref_cols: Option<Vec<String>> = row.try_get::<Vec<String>, _>(6).ok().filter(|v| !v.is_empty());
        let fk_on_update: Option<String> = row.try_get(7).unwrap_or(None);
        let fk_on_delete: Option<String> = row.try_get(8).unwrap_or(None);
        let deferrable: bool = row.try_get(9).unwrap_or(false);
        let initially_deferred: bool = row.try_get(10).unwrap_or(false);

        let check_expr = if kind == "c" { Some(def) } else { None };

        constraints.push(PgConstraintInfo {
            name, kind, columns, check_expr,
            fk_ref_schema, fk_ref_table, fk_ref_columns: fk_ref_cols,
            fk_on_update, fk_on_delete,
            deferrable, initially_deferred,
        });
    }
    Ok(constraints)
}

async fn get_pg_indexes_full(pool: &sqlx::PgPool, schema: &str, table: &str) -> Result<Vec<PgIndexFullInfo>> {
    let rows = sqlx::query(
        "SELECT \
            i.relname AS idx_name, \
            ix.indisunique, \
            ix.indisprimary, \
            am.amname, \
            pg_get_expr(ix.indpred, ix.indrelid) AS where_clause, \
            ix.indisunique AND EXISTS ( \
                SELECT 1 FROM pg_constraint c \
                WHERE c.conindid = i.oid AND c.contype = 'u' \
            ) AS is_unique_con, \
            ix.indkey::integer[], \
            ix.indoption::integer[] \
         FROM pg_class t \
         JOIN pg_index ix ON t.oid = ix.indrelid \
         JOIN pg_class i ON i.oid = ix.indexrelid \
         JOIN pg_namespace n ON n.oid = t.relnamespace \
         JOIN pg_am am ON am.oid = i.relam \
         WHERE n.nspname = $1 AND t.relname = $2 \
         ORDER BY i.relname",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await?;

    let mut indexes = Vec::new();
    for row in rows {
        let name: String = row.try_get(0).unwrap_or_default();
        let unique: bool = row.try_get(1).unwrap_or(false);
        let is_primary: bool = row.try_get(2).unwrap_or(false);
        let method: String = row.try_get(3).unwrap_or_else(|_| "btree".to_string());
        let where_clause: Option<String> = row.try_get(4).unwrap_or(None);
        let is_unique_constraint: bool = row.try_get(5).unwrap_or(false);
        let indkey: Vec<i32> = row.try_get(6).unwrap_or_default();
        let indoption: Vec<i32> = row.try_get(7).unwrap_or_default();


        let col_names = if !indkey.is_empty() {
            let attnum_list = indkey.iter()
                .filter(|&&k| k > 0)
                .map(|k| k.to_string())
                .collect::<Vec<_>>()
                .join(", ");
            if attnum_list.is_empty() {
                vec![]
            } else {
                let col_rows = sqlx::query(&format!(
                    "SELECT attnum::integer, attname FROM pg_attribute \
                     WHERE attrelid = (SELECT oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
                                      WHERE n.nspname = '{}' AND c.relname = '{}') \
                       AND attnum IN ({attnum_list}) \
                     ORDER BY attnum",
                    schema.replace('\'', "''"),
                    table.replace('\'', "''"),
                ))
                .fetch_all(pool)
                .await
                .unwrap_or_default();
                let mut by_attnum: std::collections::HashMap<i32, String> = col_rows
                    .into_iter()
                    .map(|r| (r.try_get::<i32, _>(0).unwrap_or(0), r.try_get::<String, _>(1).unwrap_or_default()))
                    .collect();
                indkey.iter().map(|&k| by_attnum.remove(&k).unwrap_or_else(|| k.to_string())).collect()
            }
        } else {
            vec![]
        };

        let columns: Vec<PgIndexColumnInfo> = col_names.into_iter().enumerate()
            .filter(|(_, name)| !name.is_empty() && name.parse::<i32>().is_err())
            .map(|(i, expr)| {
                let opt = indoption.get(i).copied().unwrap_or(0);
                let direction = if opt & 1 != 0 { "DESC" } else { "ASC" }.to_string();
                let nulls = if opt & 2 != 0 { "FIRST" } else { "LAST" }.to_string();
                PgIndexColumnInfo { expr, direction, nulls }
            })
            .collect();

        indexes.push(PgIndexFullInfo { name, unique, method, columns, where_clause, is_primary, is_unique_constraint });
    }
    Ok(indexes)
}

async fn get_pg_views_full(pool: &sqlx::PgPool, schemas: &[String]) -> Result<Vec<PgViewFullInfo>> {
    if schemas.is_empty() { return Ok(vec![]); }
    let schema_list = schemas.iter()
        .map(|s| format!("'{}'", s.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let mut views = Vec::new();


    let rows = sqlx::query(&format!(
        "SELECT schemaname, viewname, definition \
         FROM pg_views WHERE schemaname IN ({schema_list}) ORDER BY schemaname, viewname",
    ))
    .fetch_all(pool)
    .await?;
    for row in rows {
        views.push(PgViewFullInfo {
            schema: row.try_get(0).unwrap_or_default(),
            name: row.try_get(1).unwrap_or_default(),
            definition: row.try_get(2).unwrap_or_default(),
            materialized: false,
        });
    }


    let mat_rows = sqlx::query(&format!(
        "SELECT schemaname, matviewname, definition \
         FROM pg_matviews WHERE schemaname IN ({schema_list}) ORDER BY schemaname, matviewname",
    ))
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    for row in mat_rows {
        views.push(PgViewFullInfo {
            schema: row.try_get(0).unwrap_or_default(),
            name: row.try_get(1).unwrap_or_default(),
            definition: row.try_get(2).unwrap_or_default(),
            materialized: true,
        });
    }

    Ok(views)
}

async fn get_pg_functions_full(pool: &sqlx::PgPool, schemas: &[String]) -> Result<Vec<PgFunctionFullInfo>> {
    if schemas.is_empty() { return Ok(vec![]); }
    let schema_list = schemas.iter()
        .map(|s| format!("'{}'", s.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let rows = sqlx::query(&format!(
        "SELECT n.nspname, p.proname, l.lanname, \
                p.prorettype = 2279 AS returns_trigger, \
                pg_catalog.pg_get_function_arguments(p.oid) AS parameters, \
                pg_get_functiondef(p.oid) \
         FROM pg_proc p \
         JOIN pg_namespace n ON n.oid = p.pronamespace \
         JOIN pg_language l ON l.oid = p.prolang \
         WHERE n.nspname IN ({schema_list}) AND p.prokind = 'f' \
         ORDER BY n.nspname, p.proname",
    ))
    .fetch_all(pool)
    .await?;

    let fns = rows.into_iter().map(|row| PgFunctionFullInfo {
        schema: row.try_get(0).unwrap_or_default(),
        name: row.try_get(1).unwrap_or_default(),
        language: row.try_get(2).unwrap_or_else(|_| "plpgsql".to_string()),
        returns_trigger: row.try_get(3).unwrap_or(false),
        parameters: row.try_get(4).unwrap_or_default(),
        body: row.try_get(5).unwrap_or_default(),
    }).collect();
    Ok(fns)
}

async fn get_pg_enums_full(pool: &sqlx::PgPool, schemas: &[String]) -> Result<Vec<PgEnumFullInfo>> {
    if schemas.is_empty() { return Ok(vec![]); }
    let schema_list = schemas.iter()
        .map(|s| format!("'{}'", s.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let rows = sqlx::query(&format!(
        "SELECT n.nspname, t.typname, \
                ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder) AS values \
         FROM pg_type t \
         JOIN pg_namespace n ON n.oid = t.typnamespace \
         LEFT JOIN pg_enum e ON e.enumtypid = t.oid \
         WHERE t.typtype = 'e' AND n.nspname IN ({schema_list}) \
         GROUP BY n.nspname, t.typname, t.oid \
         ORDER BY n.nspname, t.typname",
    ))
    .fetch_all(pool)
    .await?;

    let enums = rows.into_iter().map(|row| PgEnumFullInfo {
        schema: row.try_get(0).unwrap_or_default(),
        name: row.try_get(1).unwrap_or_default(),
        values: row.try_get::<Vec<String>, _>(2).unwrap_or_default(),
    }).collect();
    Ok(enums)
}

async fn get_pg_triggers_full(pool: &sqlx::PgPool, schemas: &[String]) -> Result<Vec<PgTriggerFullInfo>> {
    if schemas.is_empty() { return Ok(vec![]); }
    let schema_list = schemas.iter()
        .map(|s| format!("'{}'", s.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let rows = sqlx::query(&format!(
        "SELECT \
            n.nspname AS trigger_schema, \
            t.tgname, \
            cn.nspname AS table_schema, \
            tc.relname AS table_name, \
            CASE t.tgtype & 66 \
                WHEN 2 THEN 'BEFORE' WHEN 64 THEN 'INSTEAD OF' ELSE 'AFTER' \
            END AS timing, \
            ARRAY_REMOVE(ARRAY[ \
                CASE WHEN t.tgtype & 4  != 0 THEN 'INSERT'   ELSE NULL END, \
                CASE WHEN t.tgtype & 8  != 0 THEN 'DELETE'   ELSE NULL END, \
                CASE WHEN t.tgtype & 16 != 0 THEN 'UPDATE'   ELSE NULL END, \
                CASE WHEN t.tgtype & 32 != 0 THEN 'TRUNCATE' ELSE NULL END \
            ], NULL) AS events, \
            CASE WHEN t.tgtype & 1 != 0 THEN 'ROW' ELSE 'STATEMENT' END AS for_each, \
            pg_get_expr(t.tgqual, tc.oid) AS when_clause, \
            fn.nspname AS fn_schema, \
            fp.proname AS fn_name \
         FROM pg_trigger t \
         JOIN pg_class tc ON tc.oid = t.tgrelid \
         JOIN pg_namespace cn ON cn.oid = tc.relnamespace \
         JOIN pg_proc fp ON fp.oid = t.tgfoid \
         JOIN pg_namespace fn ON fn.oid = fp.pronamespace \
         JOIN pg_namespace n ON n.oid = tc.relnamespace \
         WHERE NOT t.tgisinternal AND cn.nspname IN ({schema_list}) \
         ORDER BY cn.nspname, tc.relname, t.tgname",
    ))
    .fetch_all(pool)
    .await?;

    let triggers = rows.into_iter().map(|row| PgTriggerFullInfo {
        schema: row.try_get(0).unwrap_or_default(),
        name: row.try_get(1).unwrap_or_default(),
        table_schema: row.try_get(2).unwrap_or_default(),
        table: row.try_get(3).unwrap_or_default(),
        timing: row.try_get(4).unwrap_or_else(|_| "AFTER".to_string()),
        events: row.try_get(5).unwrap_or_default(),
        for_each: row.try_get(6).unwrap_or_else(|_| "ROW".to_string()),
        when_clause: row.try_get(7).unwrap_or(None),
        function_schema: row.try_get(8).unwrap_or_default(),
        function_name: row.try_get(9).unwrap_or_default(),
    }).collect();
    Ok(triggers)
}
