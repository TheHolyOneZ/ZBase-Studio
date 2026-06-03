use crate::error::Result;
use parking_lot::Mutex;
use std::sync::Arc;

pub type DuckConn = Arc<Mutex<duckdb::Connection>>;

pub fn open_duck(path: &str) -> Result<DuckConn> {
    let conn = duckdb::Connection::open(path)?;
    Ok(Arc::new(Mutex::new(conn)))
}
