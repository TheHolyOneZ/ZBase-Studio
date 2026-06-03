use crate::db::duck_conn::DuckConn;
use crate::db::pool::TabPool;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::{Arc, atomic::AtomicBool};

pub type TabId = String;
pub type JobId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MysqlFlavor {
    MySql,
    MariaDb,
}

pub struct JobHandle {
    pub cancel: Arc<AtomicBool>,
}

pub struct AppState {
    pub pools: RwLock<HashMap<TabId, Arc<TabPool>>>,
    pub duck_conns: RwLock<HashMap<TabId, DuckConn>>,
    pub pg_pools: RwLock<HashMap<TabId, Arc<sqlx::PgPool>>>,
    pub mysql_pools: RwLock<HashMap<TabId, (Arc<sqlx::MySqlPool>, MysqlFlavor)>>,
    pub jobs: RwLock<HashMap<JobId, JobHandle>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pools: RwLock::new(HashMap::new()),
            duck_conns: RwLock::new(HashMap::new()),
            pg_pools: RwLock::new(HashMap::new()),
            mysql_pools: RwLock::new(HashMap::new()),
            jobs: RwLock::new(HashMap::new()),
        }
    }
}

impl AppState {
    pub fn get_pool(&self, tab_id: &str) -> Option<Arc<TabPool>> {
        self.pools.read().get(tab_id).cloned()
    }

    pub fn require_pool(&self, tab_id: &str) -> crate::error::Result<Arc<TabPool>> {
        self.get_pool(tab_id)
            .ok_or_else(|| crate::error::Error::NotFound(format!("no connection for tab {tab_id}")))
    }

    pub fn require_duck(&self, tab_id: &str) -> crate::error::Result<DuckConn> {
        self.duck_conns
            .read()
            .get(tab_id)
            .cloned()
            .ok_or_else(|| {
                crate::error::Error::NotFound(format!("no duckdb connection for tab {tab_id}"))
            })
    }

    pub fn is_duck(&self, tab_id: &str) -> bool {
        self.duck_conns.read().contains_key(tab_id)
    }

    pub fn require_pg(&self, tab_id: &str) -> crate::error::Result<Arc<sqlx::PgPool>> {
        self.pg_pools
            .read()
            .get(tab_id)
            .cloned()
            .ok_or_else(|| {
                crate::error::Error::NotFound(format!("no postgres connection for tab {tab_id}"))
            })
    }

    pub fn require_mysql(&self, tab_id: &str) -> crate::error::Result<(Arc<sqlx::MySqlPool>, crate::state::MysqlFlavor)> {
        self.mysql_pools
            .read()
            .get(tab_id)
            .cloned()
            .ok_or_else(|| {
                crate::error::Error::NotFound(format!("no mysql connection for tab {tab_id}"))
            })
    }

    pub fn cancel_job(&self, job_id: &str) {
        let jobs = self.jobs.read();
        if let Some(h) = jobs.get(job_id) {
            h.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }
}
