pub mod group_repo;
pub mod host_repo;
pub mod key_repo;
pub mod port_forward_repo;
pub mod schema;
#[cfg(test)]
mod tests;

use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use rusqlite::Connection;

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::schema::configure_and_migrate;

#[derive(Clone)]
pub struct SqliteDb {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteDb {
    pub fn init(app_data_dir: &Path) -> CoreResult<Self> {
        let data_dir = app_data_dir.join("data");
        fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("app.db");
        let conn = Connection::open(&db_path)?;
        configure_and_migrate(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn init_in_memory() -> CoreResult<Self> {
        let conn = Connection::open_in_memory()?;
        configure_and_migrate(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn lock_conn(&self) -> CoreResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|e| CoreError::Internal(format!("Database mutex poisoned: {e}")))
    }

    pub fn validate_entity_name(
        raw_name: &str,
        label: &str,
        max_len: usize,
    ) -> CoreResult<String> {
        let trimmed = raw_name.trim();
        if trimmed.is_empty() {
            return Err(CoreError::Validation(format!("{label} cannot be empty")));
        }
        if trimmed.chars().count() > max_len {
            return Err(CoreError::Validation(format!(
                "{label} cannot exceed {max_len} characters"
            )));
        }
        if trimmed.chars().any(|c| c.is_control()) {
            return Err(CoreError::Validation(format!(
                "{label} contains invalid control characters"
            )));
        }
        Ok(trimmed.to_string())
    }
}
