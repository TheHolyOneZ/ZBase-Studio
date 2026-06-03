use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("connection pool error: {0}")]
    Pool(#[from] r2d2::Error),
    #[error("duckdb error: {0}")]
    DuckDb(#[from] duckdb::Error),
    #[error("postgres error: {0}")]
    Postgres(String),
    #[error("postgres ddl error at statement {index}: {message}")]
    PostgresDdl { index: usize, message: String },
    #[error("mysql error: {0}")]
    Mysql(String),
    #[error("mysql ddl error at statement {index}: {message}")]
    MysqlDdl { index: usize, message: String },
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("schema error: {0}")]
    Schema(String),
    #[error("operation cancelled")]
    Cancelled,
    #[error("invalid argument: {0}")]
    BadInput(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("other: {0}")]
    Other(String),
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let code = match self {
            Error::Io(_) => "io",
            Error::Sqlite(_) => "sqlite",
            Error::Pool(_) => "pool",
            Error::DuckDb(_) => "duckdb",
            Error::Postgres(_) => "postgres",
            Error::PostgresDdl { .. } => "postgres_ddl",
            Error::Mysql(_) => "mysql",
            Error::MysqlDdl { .. } => "mysql_ddl",
            Error::Serde(_) => "serde",
            Error::Schema(_) => "schema",
            Error::Cancelled => "cancelled",
            Error::BadInput(_) => "bad_input",
            Error::NotFound(_) => "not_found",
            Error::Other(_) => "other",
        };
        let mut m = s.serialize_map(Some(2))?;
        m.serialize_entry("code", code)?;
        m.serialize_entry("message", &self.to_string())?;
        m.end()
    }
}

impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        Error::Postgres(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
