use std::sync::Arc;

use dashmap::DashMap;
use keyring::Entry;
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};

const KEYRING_SERVICE: &str = "coreterm";

trait KeyringBackend: Send + Sync {
    fn set_password(&self, service: &str, user: &str, secret: &str) -> Result<(), keyring::Error>;
    fn get_password(&self, service: &str, user: &str) -> Result<String, keyring::Error>;
    fn delete_credential(&self, service: &str, user: &str) -> Result<(), keyring::Error>;
}

struct OsKeyringBackend;

impl KeyringBackend for OsKeyringBackend {
    fn set_password(&self, service: &str, user: &str, secret: &str) -> Result<(), keyring::Error> {
        let entry = Entry::new(service, user)?;
        entry.set_password(secret)
    }

    fn get_password(&self, service: &str, user: &str) -> Result<String, keyring::Error> {
        let entry = Entry::new(service, user)?;
        entry.get_password()
    }

    fn delete_credential(&self, service: &str, user: &str) -> Result<(), keyring::Error> {
        let entry = Entry::new(service, user)?;
        entry.delete_credential()
    }
}

#[derive(Clone)]
pub struct SecretVault {
    fallback_mem: Arc<DashMap<String, Zeroizing<String>>>,
    use_keyring: bool,
    backend: Arc<dyn KeyringBackend>,
}

impl Default for SecretVault {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretVault {
    pub fn new() -> Self {
        Self {
            fallback_mem: Arc::new(DashMap::new()),
            use_keyring: true,
            backend: Arc::new(OsKeyringBackend),
        }
    }

    #[cfg(test)]
    pub fn new_in_memory() -> Self {
        Self {
            fallback_mem: Arc::new(DashMap::new()),
            use_keyring: false,
            backend: Arc::new(OsKeyringBackend),
        }
    }

    #[cfg(test)]
    fn with_keyring_backend(backend: Arc<dyn KeyringBackend>) -> Self {
        Self {
            fallback_mem: Arc::new(DashMap::new()),
            use_keyring: true,
            backend,
        }
    }

    pub fn host_password_ref(host_id: &str) -> String {
        format!("urn:coreterm:host-password:{host_id}")
    }

    pub fn key_passphrase_ref(key_id: &str) -> String {
        format!("urn:coreterm:key-passphrase:{key_id}")
    }

    pub fn store_secret(&self, secret_ref_id: &str, secret: &str) -> CoreResult<()> {
        let zeroized = Zeroizing::new(secret.to_string());
        if !self.use_keyring {
            self.fallback_mem
                .insert(secret_ref_id.to_string(), zeroized);
            return Ok(());
        }

        self.backend
            .set_password(KEYRING_SERVICE, secret_ref_id, &zeroized)
            .map_err(|e| CoreError::Os(format!("Keyring store error: {e}")))
    }

    pub fn get_secret(&self, secret_ref_id: &str) -> CoreResult<Option<Zeroizing<String>>> {
        if !self.use_keyring {
            return Ok(self
                .fallback_mem
                .get(secret_ref_id)
                .map(|v| v.value().clone()));
        }

        match self.backend.get_password(KEYRING_SERVICE, secret_ref_id) {
            Ok(pw) => Ok(Some(Zeroizing::new(pw))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(CoreError::Os(format!("Keyring read error: {e}"))),
        }
    }

    pub fn delete_secret(&self, secret_ref_id: &str) -> CoreResult<()> {
        if !self.use_keyring {
            self.fallback_mem.remove(secret_ref_id);
            return Ok(());
        }

        match self
            .backend
            .delete_credential(KEYRING_SERVICE, secret_ref_id)
        {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(CoreError::Os(format!("Keyring delete error: {e}"))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    struct MockKeyring {
        store: Mutex<HashMap<String, String>>,
        fail_store: bool,
        fail_get: bool,
        fail_delete: bool,
    }

    impl KeyringBackend for MockKeyring {
        fn set_password(
            &self,
            _service: &str,
            user: &str,
            secret: &str,
        ) -> Result<(), keyring::Error> {
            if self.fail_store {
                return Err(keyring::Error::TooLong("secret".to_string(), 512));
            }
            self.store
                .lock()
                .unwrap()
                .insert(user.to_string(), secret.to_string());
            Ok(())
        }

        fn get_password(&self, _service: &str, user: &str) -> Result<String, keyring::Error> {
            if self.fail_get {
                return Err(keyring::Error::NoStorageAccess(
                    "vault locked".to_string().into(),
                ));
            }
            self.store
                .lock()
                .unwrap()
                .get(user)
                .cloned()
                .ok_or(keyring::Error::NoEntry)
        }

        fn delete_credential(&self, _service: &str, user: &str) -> Result<(), keyring::Error> {
            if self.fail_delete {
                return Err(keyring::Error::NoStorageAccess(
                    "vault locked".to_string().into(),
                ));
            }
            if self.store.lock().unwrap().remove(user).is_some() {
                Ok(())
            } else {
                Err(keyring::Error::NoEntry)
            }
        }
    }

    #[test]
    fn production_keyring_mode_never_caches_plaintext_in_ram_and_propagates_errors() {
        let ok_backend = Arc::new(MockKeyring {
            store: Mutex::new(HashMap::new()),
            fail_store: false,
            fail_get: false,
            fail_delete: false,
        });
        let vault = SecretVault::with_keyring_backend(ok_backend);
        let key_ref = SecretVault::host_password_ref("h1");

        vault.store_secret(&key_ref, "top-secret").expect("store");
        assert!(
            vault.fallback_mem.is_empty(),
            "production keyring mode must never populate fallback_mem"
        );
        assert_eq!(
            vault
                .get_secret(&key_ref)
                .expect("get")
                .as_deref()
                .map(String::as_str),
            Some("top-secret")
        );
        vault.delete_secret(&key_ref).expect("delete");
        assert!(vault.get_secret(&key_ref).expect("get after delete").is_none());
        // Deleting missing entry is idempotent.
        vault.delete_secret(&key_ref).expect("delete missing");

        let failing_backend = Arc::new(MockKeyring {
            store: Mutex::new(HashMap::new()),
            fail_store: true,
            fail_get: true,
            fail_delete: true,
        });
        let failing_vault = SecretVault::with_keyring_backend(failing_backend);
        assert!(failing_vault.store_secret(&key_ref, "pw").is_err());
        assert!(failing_vault.fallback_mem.is_empty());
        assert!(failing_vault.get_secret(&key_ref).is_err());
        assert!(failing_vault.delete_secret(&key_ref).is_err());
    }

    #[test]
    fn in_memory_mode_uses_fallback_mem_strictly() {
        let vault = SecretVault::new_in_memory();
        let ref_id = SecretVault::key_passphrase_ref("k1");
        vault.store_secret(&ref_id, "pass123").expect("store");
        assert_eq!(vault.fallback_mem.len(), 1);
        assert_eq!(
            vault
                .get_secret(&ref_id)
                .expect("get")
                .as_deref()
                .map(String::as_str),
            Some("pass123")
        );
        vault.delete_secret(&ref_id).expect("delete");
        assert!(vault.fallback_mem.is_empty());
        assert!(vault.get_secret(&ref_id).expect("get none").is_none());
    }
}
