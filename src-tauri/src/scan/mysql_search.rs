use crate::scan::search::{SearchHit, SearchOptions};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::Emitter;

pub async fn run_mysql_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<sqlx::MySqlPool>,
    job_id: String,
    needle: String,
    opts: SearchOptions,
    cancel: Arc<AtomicBool>,
) {

    let current_db: String = match sqlx::query_scalar("SELECT DATABASE()")
        .fetch_one(pool.as_ref())
        .await
    {
        Ok(Some(d)) => d,
        _ => {
            let _ = app.emit(&format!("search://error/{job_id}"), "Cannot determine current database");
            return;
        }
    };

    let tables: Vec<(String, String)> = match sqlx::query_as(
        "SELECT TABLE_SCHEMA, TABLE_NAME \
         FROM information_schema.TABLES \
         WHERE TABLE_TYPE = 'BASE TABLE' \
           AND TABLE_SCHEMA = ? \
         ORDER BY TABLE_NAME",
    )
    .bind(&current_db)
    .fetch_all(pool.as_ref())
    .await
    {
        Ok(t) => t,
        Err(e) => {
            let _ = app.emit(&format!("search://error/{job_id}"), e.to_string());
            return;
        }
    };

    let regex_obj = if opts.use_regex {
        let flags = if opts.case_sensitive { "" } else { "(?i)" };
        regex::Regex::new(&format!("{}{}", flags, needle)).ok()
    } else {
        None
    };

    let needle_lower = if opts.case_sensitive {
        String::new()
    } else {
        needle.to_lowercase()
    };

    let like_pattern = format!("%{}%", needle.replace('%', "\\%").replace('_', "\\_"));
    let like_pattern_ci = format!("%{}%", needle.to_lowercase().replace('%', "\\%").replace('_', "\\_"));

    let mut hit_buffer: Vec<SearchHit> = Vec::new();
    let mut last_emit = std::time::Instant::now();

    'outer: for (schema, table) in &tables {
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        let cols: Vec<String> = match sqlx::query_scalar(
            "SELECT COLUMN_NAME \
             FROM information_schema.COLUMNS \
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
             ORDER BY ORDINAL_POSITION",
        )
        .bind(schema)
        .bind(table)
        .fetch_all(pool.as_ref())
        .await
        {
            Ok(c) => c,
            Err(_) => continue,
        };

        if cols.is_empty() {
            continue;
        }


        let select_parts: Vec<String> = cols
            .iter()
            .map(|c| format!("CAST(`{}` AS CHAR)", c.replace('`', "``")))
            .collect();


        let where_parts: Vec<String> = if opts.use_regex {


            cols.iter()
                .map(|c| format!("CAST(`{}` AS CHAR) LIKE ?", c.replace('`', "``")))
                .collect()
        } else if opts.case_sensitive {
            cols.iter()
                .map(|c| format!("CAST(`{}` AS CHAR) LIKE ? COLLATE utf8mb4_bin", c.replace('`', "``")))
                .collect()
        } else {
            cols.iter()
                .map(|c| format!("CAST(`{}` AS CHAR) LIKE ?", c.replace('`', "``")))
                .collect()
        };

        if where_parts.is_empty() {
            continue;
        }

        let sql = format!(
            "SELECT {} FROM `{}`.`{}` WHERE {} LIMIT 100000",
            select_parts.join(", "),
            schema.replace('`', "``"),
            table.replace('`', "``"),
            where_parts.join(" OR "),
        );


        let search_arg = if opts.case_sensitive {
            like_pattern.clone()
        } else {
            like_pattern_ci.clone()
        };


        let mut query = sqlx::query(&sql);
        for _ in 0..where_parts.len() {
            query = query.bind(&search_arg);
        }

        let rows = match query.fetch_all(pool.as_ref()).await {
            Ok(r) => r,
            Err(_) => continue,
        };

        for (row_idx, row) in rows.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                break 'outer;
            }

            use sqlx::Row;
            for (col_i, col_name) in cols.iter().enumerate() {
                let cell: Option<String> = row.try_get(col_i).ok().flatten();
                if let Some(ref val_str) = cell {
                    let matched = if let Some(ref re) = regex_obj {
                        re.is_match(val_str)
                    } else if opts.case_sensitive {
                        val_str.contains(&needle)
                    } else {
                        val_str.to_lowercase().contains(&needle_lower)
                    };

                    if matched {
                        hit_buffer.push(SearchHit {
                            table: table.clone(),
                            column: col_name.clone(),
                            row_index: row_idx as i64,
                            value: serde_json::Value::String(val_str.clone()),
                        });
                    }
                }

                let elapsed = last_emit.elapsed();
                if hit_buffer.len() >= 50 || elapsed.as_millis() >= 100 {
                    let _ = app.emit(&format!("search://hit/{job_id}"), &hit_buffer);
                    hit_buffer.clear();
                    last_emit = std::time::Instant::now();
                }
            }
        }
    }

    if !hit_buffer.is_empty() {
        let _ = app.emit(&format!("search://hit/{job_id}"), &hit_buffer);
    }
    let _ = app.emit(&format!("search://done/{job_id}"), ());
}
