use regex::Regex;


pub fn is_mysql_dump(sql: &str) -> bool {
    let head = &sql[..sql.len().min(4096)];
    head.contains("MySQL dump")
        || head.contains("mysqldump")
        || head.contains("MariaDB dump")
        || head.contains("phpMyAdmin SQL Dump")
        || {
            let low = head.to_ascii_lowercase();
            low.contains("engine=innodb")
                || low.contains("engine=myisam")
                || low.contains("engine=memory")
                || low.contains("engine=ndbcluster")
                || (low.contains("set names ") && !low.contains("pragma"))
        }
}


pub fn mysql_to_sqlite_stmts(sql: &str) -> Vec<String> {
    let preprocessed = expand_conditional_comments(sql);
    let mut out = Vec::new();

    for stmt in collect_stmts(&preprocessed) {
        let stmt = stmt.trim();
        if stmt.is_empty() {
            continue;
        }

        let sql_head = first_sql_start(stmt);
        if sql_head.is_empty() {
            continue;
        }
        let sig_raw = sql_head[..sql_head.len().min(80)].to_ascii_uppercase();
        let sig = sig_raw.trim_start();

        if should_skip(sig) {
            continue;
        }


        if sig.starts_with("CREATE DEFINER")
            || sig.starts_with("CREATE PROCEDURE")
            || sig.starts_with("CREATE FUNCTION")
            || sig.starts_with("CREATE EVENT")
            || sig.starts_with("CREATE DATABASE")
            || sig.starts_with("CREATE SCHEMA")
            || sig.starts_with("DROP DATABASE")
            || sig.starts_with("DROP SCHEMA")

            || sig.starts_with("GRANT ")
            || sig.starts_with("REVOKE ")
            || sig.starts_with("CREATE USER")
            || sig.starts_with("DROP USER")
            || sig.starts_with("ALTER USER")
            || sig.starts_with("FLUSH PRIVILEGES")
        {
            continue;
        }


        if sig.starts_with("ALTER TABLE") {
            let is_add_key = sig.contains("ADD KEY")
                || sig.contains("ADD INDEX")
                || (sig.contains("ADD UNIQUE") && (sig.contains("KEY") || sig.contains("INDEX")));
            if !is_add_key {
                continue;
            }
        }

        let transformed = if sig.starts_with("CREATE TABLE")
            || sig.starts_with("CREATE TEMPORARY TABLE")
        {
            match rewrite_create_table(stmt) {
                Some((ddl, idxs)) => {
                    out.push(ddl);
                    for idx in idxs {
                        out.push(idx);
                    }
                    continue;
                }
                None => stmt.to_string(),
            }
        } else if sig.starts_with("INSERT") || sig.starts_with("REPLACE") {
            transform_insert(stmt)
        } else if sig.starts_with("CREATE OR REPLACE VIEW") || sig.starts_with("CREATE VIEW") {
            transform_create_view(stmt)
        } else if sig.starts_with("CREATE TRIGGER") {
            transform_create_trigger(stmt)
        } else if sig.starts_with("ALTER TABLE") {

            match rewrite_alter_add_key(stmt) {
                Some(idx_stmt) => idx_stmt,
                None => { continue; }
            }
        } else {
            stmt.to_string()
        };

        out.push(transformed);
    }

    out
}


fn expand_conditional_comments(sql: &str) -> String {
    let re = Regex::new(r#"(?s)/\*!\d*\s*(.*?)\*/"#).unwrap();
    re.replace_all(sql, |caps: &regex::Captures| caps[1].trim().to_string())
        .into_owned()
}


fn collect_stmts(sql: &str) -> Vec<&str> {
    let bytes = sql.as_bytes();
    let n = bytes.len();
    let mut result = Vec::new();
    let mut start = 0;
    let mut i = 0;

    while i < n {
        match bytes[i] {
            b'\'' => i = skip_str(bytes, i + 1, b'\''),
            b'"' => i = skip_str(bytes, i + 1, b'"'),
            b'`' => {
                i += 1;
                while i < n && bytes[i] != b'`' {
                    i += 1;
                }
                if i < n {
                    i += 1;
                }
            }
            b'-' if i + 1 < n && bytes[i + 1] == b'-' => {
                while i < n && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            b'#' => {
                while i < n && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < n && bytes[i + 1] == b'*' => {
                i += 2;
                while i + 1 < n && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                if i + 1 < n {
                    i += 2;
                }
            }
            b';' => {
                let s = sql[start..i].trim();
                if !s.is_empty() {
                    result.push(s);
                }
                i += 1;
                start = i;
            }
            _ => i += 1,
        }
    }

    if start < n {
        let tail = sql[start..].trim();
        if !tail.is_empty() {
            result.push(tail);
        }
    }

    result
}

pub fn skip_str(bytes: &[u8], mut i: usize, quote: u8) -> usize {
    let n = bytes.len();
    while i < n {
        if bytes[i] == b'\\' {
            i += 2;
        } else if bytes[i] == quote {
            if i + 1 < n && bytes[i + 1] == quote {
                i += 2;
            } else {
                return i + 1;
            }
        } else {
            i += 1;
        }
    }
    i
}


fn first_sql_start(stmt: &str) -> &str {
    let mut s = stmt;
    loop {
        s = s.trim_start();
        if s.starts_with("--") || s.starts_with('#') {
            s = match s.find('\n') {
                Some(nl) => &s[nl + 1..],
                None => return "",
            };
        } else if s.starts_with("/*") {
            s = match s.find("*/") {
                Some(end) => &s[end + 2..],
                None => return "",
            };
        } else {
            return s;
        }
    }
}

fn should_skip(sig: &str) -> bool {

    sig.starts_with("SET ")

        || sig.starts_with("COMMIT")
        || sig.starts_with("ROLLBACK")
        || sig.starts_with("START TRANSACTION")

        || sig.starts_with("LOCK TABLES")
        || sig.starts_with("UNLOCK TABLES")

        || sig.starts_with("FLUSH ")
        || sig.starts_with("ANALYZE ")
        || sig.starts_with("OPTIMIZE ")
        || sig.starts_with("REPAIR ")
        || sig.starts_with("CHECK TABLE")
        || sig.starts_with("SHOW ")
        || sig.starts_with("DESCRIBE ")
        || sig.starts_with("DESC ")

        || sig.starts_with("DELIMITER ")

        || (sig.starts_with("USE ") && !sig.contains('('))

        || false
}


fn rewrite_create_table(stmt: &str) -> Option<(String, Vec<String>)> {
    let name_re = Regex::new(
        r#"(?i)CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\("#,
    )
    .unwrap();
    let cap = name_re.captures(stmt)?;
    let table = cap[1].to_string();
    let open = cap.get(0).unwrap().end() - 1;
    let close = find_close_paren(stmt.as_bytes(), open)?;

    let body = &stmt[open + 1..close];
    let body = apply_type_conversions(body);
    let items = depth0_split(&body);

    let mut col_defs: Vec<String> = Vec::new();
    let mut constraints: Vec<String> = Vec::new();
    let mut idx_stmts: Vec<String> = Vec::new();

    for item in &items {
        let item = item.trim();
        if item.is_empty() {
            continue;
        }
        let sig80 = item[..item.len().min(80)].to_ascii_uppercase();
        let sig = sig80.trim_start();

        if sig.starts_with("PRIMARY KEY") {
            constraints.push(item.to_string());
        } else if sig.starts_with("UNIQUE KEY") || sig.starts_with("UNIQUE INDEX") {
            if let Some(s) = parse_key(item, &table, true) {
                idx_stmts.push(s);
            }
        } else if sig.starts_with("KEY ") || sig.starts_with("KEY`") || sig.starts_with("INDEX ") {
            if let Some(s) = parse_key(item, &table, false) {
                idx_stmts.push(s);
            }
        } else if sig.starts_with("FULLTEXT") || sig.starts_with("SPATIAL") {

        } else if sig.starts_with("CONSTRAINT") {
            if sig.contains("FOREIGN KEY") {
                constraints.push(clean_fk(item));
            }
        } else {
            col_defs.push(normalize_spaces(item));
        }
    }

    let mut all = col_defs;
    all.extend(constraints);

    let body_str = all
        .iter()
        .map(|s| format!("  {s}"))
        .collect::<Vec<_>>()
        .join(",\n");

    Some((
        format!("CREATE TABLE IF NOT EXISTS `{table}` (\n{body_str}\n)"),
        idx_stmts,
    ))
}

fn apply_type_conversions(body: &str) -> String {
    let mut s = body.to_string();

    macro_rules! sub {
        ($pat:expr, $rep:expr) => {{
            let re = Regex::new($pat).unwrap();
            s = re.replace_all(&s, $rep).into_owned();
        }};
    }

    sub!(r#"(?i)\bENUM\s*\([^)]+\)"#, "TEXT");
    sub!(r#"(?i)\bSET\s*\([^)]+\)"#, "TEXT");
    sub!(r#"(?i)\b(?:TINY|SMALL|MEDIUM|BIG)?INT(?:EGER)?\s*(?:\(\s*\d+\s*\))?"#, "INTEGER");
    sub!(r#"(?i)\bNATIONAL\s+(?:VAR)?CHAR\s*\(\s*\d+\s*\)"#, "TEXT");
    sub!(r#"(?i)\b(?:N?VAR)?CHAR\s*\(\s*\d+\s*\)"#, "TEXT");
    sub!(r#"(?i)\bNTEXT\b"#, "TEXT");
    sub!(r#"(?i)\b(?:TINY|MEDIUM|LONG)TEXT\b"#, "TEXT");
    sub!(r#"(?i)\b(?:TINY|MEDIUM|LONG)BLOB\b"#, "BLOB");
    sub!(r#"(?i)\b(?:FLOAT|DOUBLE(?:\s+PRECISION)?)\s*(?:\(\s*\d+\s*,\s*\d+\s*\))?"#, "REAL");
    sub!(r#"(?i)\b(?:DECIMAL|NUMERIC)\s*(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?"#, "NUMERIC");
    sub!(r#"(?i)\b(DATETIME|TIMESTAMP|TIME)\s*\(\s*\d+\s*\)"#, "$1");
    sub!(r#"(?i)\bCURRENT_TIMESTAMP\s*\(\s*\d+\s*\)"#, "CURRENT_TIMESTAMP");
    sub!(r#"(?i)\bYEAR\s*(?:\(\s*\d+\s*\))?"#, "INTEGER");
    sub!(r#"(?i)\bJSON\b"#, "TEXT");
    sub!(r#"(?i)\b(?:GEOMETRY(?:COLLECTION)?|POINT|LINESTRING|POLYGON|MULTI(?:POINT|LINESTRING|POLYGON))\b"#, "BLOB");
    sub!(r#"(?i)\bBIT\s*(?:\(\s*\d+\s*\))?"#, "INTEGER");
    sub!(r#"(?i)\bUNSIGNED\b"#, "");
    sub!(r#"(?i)\bZEROFILL\b"#, "");
    sub!(r#"(?i)\bCHARACTER\s+SET\s+\w+"#, "");
    sub!(r#"(?i)\bCOLLATE\s+\w+"#, "");
    sub!(r#"(?i)\bON\s+UPDATE\s+\w+(?:\s*\(\s*\))?"#, "");
    sub!(r#"(?i)\bCOMMENT\s+'(?:[^'\\]|\\.)*'"#, "");
    sub!(r#"(?i)\bAUTO_INCREMENT\b"#, "");
    sub!(r#"(?i)\bVISIBLE\b"#, "");
    sub!(r#"(?i)\bINVISIBLE\b"#, "");
    sub!(r#"(?i)\bSTORED\b"#, "");
    sub!(r#"(?i)\bVIRTUAL\b"#, "");

    s
}


fn transform_insert(stmt: &str) -> String {
    let mut s = stmt.to_string();


    {
        let re = Regex::new(r#"(?i)\bREPLACE\s+INTO\b"#).unwrap();
        s = re.replace(&s, "INSERT OR REPLACE INTO").into_owned();
    }


    {
        let re = Regex::new(r#"(?i)\bINSERT\s+IGNORE\s+INTO\b"#).unwrap();
        s = re.replace(&s, "INSERT OR IGNORE INTO").into_owned();
    }


    {
        let re = Regex::new(r#"(?is)\s*\bON\s+DUPLICATE\s+KEY\s+UPDATE\b.*$"#).unwrap();
        s = re.replace(&s, "").into_owned();
    }


    {
        let re = Regex::new(r#"(?i)_(?:binary|utf8mb4|utf8|latin1|ascii|ucs2|utf16|utf32)\s*"#).unwrap();
        s = re.replace_all(&s, "").into_owned();
    }

    s
}


fn transform_create_view(stmt: &str) -> String {
    let mut s = stmt.to_string();


    {
        let re = Regex::new(r#"(?i)\bALGORITHM\s*=\s*\w+"#).unwrap();
        s = re.replace(&s, "").into_owned();
    }

    {
        let re = Regex::new(r#"(?i)\bDEFINER\s*=\s*\S+"#).unwrap();
        s = re.replace(&s, "").into_owned();
    }

    {
        let re = Regex::new(r#"(?i)\bSQL\s+SECURITY\s+\w+"#).unwrap();
        s = re.replace(&s, "").into_owned();
    }

    {
        let re = Regex::new(r#"(?i)\bCREATE\s+VIEW\b"#).unwrap();
        s = re.replace(&s, "CREATE VIEW IF NOT EXISTS").into_owned();
    }

    normalize_spaces(&s)
}

fn transform_create_trigger(stmt: &str) -> String {
    let mut s = stmt.to_string();

    {
        let re = Regex::new(r#"(?i)\bDEFINER\s*=\s*\S+"#).unwrap();
        s = re.replace(&s, "").into_owned();
    }
    normalize_spaces(&s)
}


fn clean_fk(constraint: &str) -> String {
    let re = Regex::new(r#"(?i)\bMATCH\s+(?:FULL|PARTIAL|SIMPLE)\b"#).unwrap();
    let s = re.replace_all(constraint, "").into_owned();
    normalize_spaces(&s)
}


fn rewrite_alter_add_key(stmt: &str) -> Option<String> {
    let re = Regex::new(
        r#"(?i)ALTER\s+TABLE\s+[`"']?(\w+)[`"']?\s+ADD\s+(UNIQUE\s+)?(?:KEY|INDEX)\s+[`"']?(\w+)[`"']?\s*(\((?:[^()]+|\([^()]*\))*\))"#,
    ).unwrap();
    let cap = re.captures(stmt)?;
    let table = &cap[1];
    let unique = if cap.get(2).is_some() { "UNIQUE " } else { "" };
    let name = &cap[3];
    let cols_raw = &cap[4];
    let prefix_re = Regex::new(r#"\(\s*\d+\s*\)"#).unwrap();
    let cols = prefix_re.replace_all(cols_raw, "").into_owned();
    Some(format!("CREATE {unique}INDEX IF NOT EXISTS `{name}` ON `{table}` {cols}"))
}

fn parse_key(item: &str, table: &str, unique: bool) -> Option<String> {
    let re = Regex::new(
        r#"(?i)(?:UNIQUE\s+)?(?:KEY|INDEX)\s+[`"']?(\w+)[`"']?\s*(\((?:[^()]+|\([^()]*\))*\))"#,
    )
    .unwrap();
    let cap = re.captures(item)?;
    let name = &cap[1];
    let cols_raw = &cap[2];


    let prefix_re = Regex::new(r#"\(\s*\d+\s*\)"#).unwrap();
    let cols = prefix_re.replace_all(cols_raw, "").into_owned();
    let uq = if unique { "UNIQUE " } else { "" };
    Some(format!(
        "CREATE {uq}INDEX IF NOT EXISTS `{name}` ON `{table}` {cols}"
    ))
}


fn find_close_paren(bytes: &[u8], open: usize) -> Option<usize> {
    debug_assert_eq!(bytes[open], b'(');
    let n = bytes.len();
    let mut depth = 0i32;
    let mut i = open;
    while i < n {
        match bytes[i] {
            b'\'' => i = skip_str(bytes, i + 1, b'\''),
            b'"' => i = skip_str(bytes, i + 1, b'"'),
            b'`' => {
                i += 1;
                while i < n && bytes[i] != b'`' {
                    i += 1;
                }
                if i < n {
                    i += 1;
                }
            }
            b'(' => {
                depth += 1;
                i += 1;
            }
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    None
}

fn depth0_split(s: &str) -> Vec<String> {
    let bytes = s.as_bytes();
    let n = bytes.len();
    let mut items = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    let mut i = 0;

    while i < n {
        match bytes[i] {
            b'\'' => {
                i = skip_str(bytes, i + 1, b'\'');
                continue;
            }
            b'"' => {
                i = skip_str(bytes, i + 1, b'"');
                continue;
            }
            b'`' => {
                i += 1;
                while i < n && bytes[i] != b'`' {
                    i += 1;
                }
                if i < n {
                    i += 1;
                }
                continue;
            }
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b',' if depth == 0 => {
                let item = s[start..i].trim().to_string();
                if !item.is_empty() {
                    items.push(item);
                }
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }

    let tail = s[start..].trim().to_string();
    if !tail.is_empty() {
        items.push(tail);
    }

    items
}

fn normalize_spaces(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
