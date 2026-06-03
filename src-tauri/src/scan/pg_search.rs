use crate::scan::search::{SearchHit, SearchOptions};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tauri::Emitter;

pub async fn run_pg_search<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    pool: Arc<sqlx::PgPool>,
    job_id: String,
    needle: String,
    opts: SearchOptions,
    cancel: Arc<AtomicBool>,
) {
    let tables: Vec<(String, String)> = match sqlx::query_as(
        "SELECT n.nspname::text, c.relname::text \
         FROM pg_class c \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE c.relkind = 'r' \
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') \
         ORDER BY n.nspname, c.relname",
    )
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

    let ilike_pattern = format!("%{}%", needle.replace('%', "\\%").replace('_', "\\_"));
    let like_pattern = format!("%{}%", needle.to_lowercase().replace('%', "\\%").replace('_', "\\_"));

    let mut hit_buffer: Vec<SearchHit> = Vec::new();
    let mut last_emit = std::time::Instant::now();

    'outer: for (schema, table) in &tables {
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        let cols: Vec<String> = match sqlx::query_scalar(
            "SELECT column_name::text FROM information_schema.columns \
             WHERE table_schema = $1 AND table_name = $2 \
             ORDER BY ordinal_position",
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
            .map(|c| format!("\"{}\"::text", c.replace('"', "\"\"")))
            .collect();


        let where_parts: Vec<String> = if opts.use_regex {

            let op = if opts.case_sensitive { "~" } else { "~*" };
            cols.iter()
                .map(|c| format!("\"{}\"::text {} $1", c.replace('"', "\"\""), op))
                .collect()
        } else if opts.case_sensitive {
            cols.iter()
                .map(|c| format!("\"{}\"::text LIKE $1", c.replace('"', "\"\"")))
                .collect()
        } else {
            cols.iter()
                .map(|c| format!("\"{}\"::text ILIKE $1", c.replace('"', "\"\"")))
                .collect()
        };

        if where_parts.is_empty() {
            continue;
        }

        let sql = format!(
            "SELECT {} FROM \"{}\".\"{}\"{} LIMIT 100000",
            select_parts.join(", "),
            schema.replace('"', "\"\""),
            table.replace('"', "\"\""),
            format!(" WHERE {}", where_parts.join(" OR ")),
        );

        let search_arg = if opts.use_regex {
            needle.clone()
        } else if opts.case_sensitive {
            like_pattern.clone()
        } else {
            ilike_pattern.clone()
        };

        let rows = match sqlx::query(&sql)
            .bind(&search_arg)
            .fetch_all(pool.as_ref())
            .await
        {
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
                            table: format!("{schema}.{table}"),
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
