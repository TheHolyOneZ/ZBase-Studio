

pub fn split_pg(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let n = chars.len();
    let mut stmts = Vec::new();
    let mut cur = String::new();
    let mut i = 0;

    while i < n {

        if chars[i] == '-' && i + 1 < n && chars[i + 1] == '-' {
            cur.push('-');
            cur.push('-');
            i += 2;
            while i < n && chars[i] != '\n' {
                cur.push(chars[i]);
                i += 1;
            }
            continue;
        }


        if chars[i] == '/' && i + 1 < n && chars[i + 1] == '*' {
            cur.push('/');
            cur.push('*');
            i += 2;
            let mut depth = 1usize;
            while i < n && depth > 0 {
                if chars[i] == '/' && i + 1 < n && chars[i + 1] == '*' {
                    depth += 1;
                    cur.push('/');
                    cur.push('*');
                    i += 2;
                } else if chars[i] == '*' && i + 1 < n && chars[i + 1] == '/' {
                    depth -= 1;
                    cur.push('*');
                    cur.push('/');
                    i += 2;
                } else {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }


        if chars[i] == '$' {
            let mut tag_end = i + 1;
            while tag_end < n && chars[tag_end] != '$' && chars[tag_end] != '\n' && !chars[tag_end].is_whitespace() {
                tag_end += 1;
            }
            if tag_end < n && chars[tag_end] == '$' {
                let tag: String = chars[i..=tag_end].iter().collect();
                cur.push_str(&tag);
                i = tag_end + 1;

                loop {
                    if i + tag.len() > n {

                        while i < n { cur.push(chars[i]); i += 1; }
                        break;
                    }
                    let candidate: String = chars[i..i + tag.len()].iter().collect();
                    if candidate == tag {
                        cur.push_str(&tag);
                        i += tag.len();
                        break;
                    }
                    cur.push(chars[i]);
                    i += 1;
                }
                continue;
            }
        }


        if chars[i] == '\'' {
            cur.push('\'');
            i += 1;
            loop {
                if i >= n { break; }
                if chars[i] == '\'' {
                    cur.push('\'');
                    i += 1;
                    if i < n && chars[i] == '\'' {
                        cur.push('\'');
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }


        if chars[i] == '"' {
            cur.push('"');
            i += 1;
            loop {
                if i >= n { break; }
                if chars[i] == '"' {
                    cur.push('"');
                    i += 1;
                    if i < n && chars[i] == '"' {
                        cur.push('"');
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }


        if chars[i] == ';' {
            let s = cur.trim().to_string();
            if !s.is_empty() {
                stmts.push(s);
            }
            cur.clear();
            i += 1;
            continue;
        }

        cur.push(chars[i]);
        i += 1;
    }

    let s = cur.trim().to_string();
    if !s.is_empty() {
        stmts.push(s);
    }
    stmts
}


pub fn split_mysql(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let n = chars.len();
    let mut stmts = Vec::new();
    let mut cur = String::new();
    let mut delimiter: Vec<char> = vec![';'];
    let mut i = 0;

    while i < n {

        let cur_is_stmt_start = cur.lines().all(|l| {
            let t = l.trim();
            t.is_empty() || t.starts_with("--") || t.starts_with('#')
        });
        if cur_is_stmt_start {
            let rest: String = chars[i..].iter().collect();
            let upper = rest.to_uppercase();
            if upper.starts_with("DELIMITER") && upper.len() > 9 && (upper.as_bytes()[9] == b' ' || upper.as_bytes()[9] == b'\t') {

                i += 9;

                while i < n && (chars[i] == ' ' || chars[i] == '\t') {
                    i += 1;
                }

                let mut new_delim = String::new();
                while i < n && chars[i] != '\n' && chars[i] != '\r' {
                    new_delim.push(chars[i]);
                    i += 1;
                }
                let new_delim = new_delim.trim().to_string();
                if !new_delim.is_empty() {
                    delimiter = new_delim.chars().collect();
                }
                cur.clear();
                continue;
            }
        }


        if chars[i] == '-' && i + 1 < n && chars[i + 1] == '-' {
            cur.push('-');
            cur.push('-');
            i += 2;
            while i < n && chars[i] != '\n' {
                cur.push(chars[i]);
                i += 1;
            }
            continue;
        }


        if chars[i] == '#' {
            cur.push('#');
            i += 1;
            while i < n && chars[i] != '\n' {
                cur.push(chars[i]);
                i += 1;
            }
            continue;
        }


        if chars[i] == '/' && i + 1 < n && chars[i + 1] == '*' {

            cur.push('/');
            cur.push('*');
            i += 2;
            while i < n {
                if chars[i] == '*' && i + 1 < n && chars[i + 1] == '/' {
                    cur.push('*');
                    cur.push('/');
                    i += 2;
                    break;
                }
                cur.push(chars[i]);
                i += 1;
            }
            continue;
        }


        if chars[i] == '`' {
            cur.push('`');
            i += 1;
            while i < n {
                if chars[i] == '`' {
                    cur.push('`');
                    i += 1;
                    if i < n && chars[i] == '`' {
                        cur.push('`');
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }


        if chars[i] == '\'' {
            cur.push('\'');
            i += 1;
            while i < n {
                if chars[i] == '\\' && i + 1 < n {
                    cur.push('\\');
                    cur.push(chars[i + 1]);
                    i += 2;
                } else if chars[i] == '\'' {
                    cur.push('\'');
                    i += 1;
                    if i < n && chars[i] == '\'' {
                        cur.push('\'');
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }


        if chars[i] == '"' {
            cur.push('"');
            i += 1;
            while i < n {
                if chars[i] == '\\' && i + 1 < n {
                    cur.push('\\');
                    cur.push(chars[i + 1]);
                    i += 2;
                } else if chars[i] == '"' {
                    cur.push('"');
                    i += 1;
                    if i < n && chars[i] == '"' {
                        cur.push('"');
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }


        if i + delimiter.len() <= n {
            let candidate: &[char] = &chars[i..i + delimiter.len()];
            if candidate == delimiter.as_slice() {
                let s = cur.trim().to_string();
                if !s.is_empty() {
                    stmts.push(s);
                }
                cur.clear();
                i += delimiter.len();
                continue;
            }
        }

        cur.push(chars[i]);
        i += 1;
    }

    let s = cur.trim().to_string();
    if !s.is_empty() {
        stmts.push(s);
    }
    stmts
}
