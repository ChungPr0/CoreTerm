use std::sync::Arc;

use dashmap::DashMap;
use keyring::Entry;
use zeroize::Zeroizing;

use crate::ipc::error::{AppError, AppResult};

const KEYRING_SERVICE: &str = "coreterm";

#[derive(Clone, Default)]
pub struct SecretVault {
    fallback_mem: Arc<DashMap<String, Zeroizing<String>>>,
}

impl SecretVault {
    pub fn new() -> Self {
        Self {
            fallback_mem: Arc::new(DashMap::new()),
        }
    }

    pub fn host_password_ref(host_id: &str) -> String {
        format!("urn:coreterm:host-password:{host_id}")
    }

    pub fn key_passphrase_ref(key_id: &str) -> String {
        format!("urn:coreterm:key-passphrase:{key_id}")
    }

    pub fn store_secret(&self, secret_ref_id: &str, secret: &str) -> AppResult<()> {
        let zeroized = Zeroizing::new(secret.to_string());
        self.fallback_mem
            .insert(secret_ref_id.to_string(), zeroized.clone());

        if let Ok(entry) = Entry::new(KEYRING_SERVICE, secret_ref_id) {
            let _ = entry.set_password(&zeroized);
        }
        Ok(())
    }

    pub fn get_secret(&self, secret_ref_id: &str) -> AppResult<Option<Zeroizing<String>>> {
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, secret_ref_id) {
            match entry.get_password() {
                Ok(pw) => return Ok(Some(Zeroizing::new(pw))),
                Err(keyring::Error::NoEntry) => {}
                Err(_) => {}
            }
        }

        if let Some(mem_val) = self.fallback_mem.get(secret_ref_id) {
            return Ok(Some(mem_val.value().clone()));
        }

        Ok(None)
    }

    pub fn delete_secret(&self, secret_ref_id: &str) -> AppResult<()> {
        self.fallback_mem.remove(secret_ref_id);
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, secret_ref_id) {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(e) => {
                    return Err(AppError::Os(format!("Keyring delete error: {e}")));
                }
            }
        }
        Ok(())
    }
}
