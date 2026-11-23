use std::sync::Arc;

use dashmap::DashMap;
use zeroize::Zeroizing;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TabSecretKind {
    Password,
    KeyPassphrase,
}

impl TabSecretKind {
    pub fn from_prompt_type(prompt_type: &str) -> Self {
        if prompt_type == "KEY_PASSPHRASE" {
            Self::KeyPassphrase
        } else {
            Self::Password
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct TabSecretKey {
    tab_id: String,
    host_id: String,
    kind: TabSecretKind,
}

#[derive(Clone, Default)]
pub struct TabSecretStore {
    entries: Arc<DashMap<TabSecretKey, Zeroizing<String>>>,
}

impl TabSecretStore {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(DashMap::new()),
        }
    }

    pub fn get(
        &self,
        tab_id: &str,
        host_id: &str,
        kind: TabSecretKind,
    ) -> Option<Zeroizing<String>> {
        let tab = tab_id.trim();
        let host = host_id.trim();
        if tab.is_empty() || host.is_empty() {
            return None;
        }
        let key = TabSecretKey {
            tab_id: tab.to_string(),
            host_id: host.to_string(),
            kind,
        };
        self.entries.get(&key).map(|entry| entry.value().clone())
    }

    pub fn set(
        &self,
        tab_id: &str,
        host_id: &str,
        kind: TabSecretKind,
        secret: Zeroizing<String>,
    ) {
        let tab = tab_id.trim();
        let host = host_id.trim();
        if tab.is_empty() || host.is_empty() || secret.is_empty() {
            return;
        }
        let key = TabSecretKey {
            tab_id: tab.to_string(),
            host_id: host.to_string(),
            kind,
        };
        self.entries.insert(key, secret);
    }

    pub fn remove(&self, tab_id: &str, host_id: &str, kind: TabSecretKind) {
        let tab = tab_id.trim();
        let host = host_id.trim();
        if tab.is_empty() || host.is_empty() {
            return;
        }
        let key = TabSecretKey {
            tab_id: tab.to_string(),
            host_id: host.to_string(),
            kind,
        };
        self.entries.remove(&key);
    }

    pub fn clear_tab(&self, tab_id: &str) {
        let tab = tab_id.trim();
        if tab.is_empty() {
            return;
        }
        self.entries.retain(|k, _| k.tab_id != tab);
    }

    pub fn clear_host(&self, host_id: &str) {
        let host = host_id.trim();
        if host.is_empty() {
            return;
        }
        self.entries.retain(|k, _| k.host_id != host);
    }

    pub fn clear_all_passphrases(&self) {
        self.entries
            .retain(|k, _| k.kind != TabSecretKind::KeyPassphrase);
    }

    pub fn clear_all(&self) {
        self.entries.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isolates_secrets_per_tab_and_shares_within_same_tab() {
        let store = TabSecretStore::new();
        store.set(
            "tab-1",
            "host-a",
            TabSecretKind::Password,
            Zeroizing::new("secret-1".to_string()),
        );

        assert_eq!(
            store
                .get("tab-1", "host-a", TabSecretKind::Password)
                .as_deref()
                .map(String::as_str),
            Some("secret-1")
        );
        assert!(store
            .get("tab-2", "host-a", TabSecretKind::Password)
            .is_none());
        assert!(store
            .get("tab-1", "host-b", TabSecretKind::Password)
            .is_none());
        assert!(store
            .get("tab-1", "host-a", TabSecretKind::KeyPassphrase)
            .is_none());
    }

    #[test]
    fn supports_removal_and_scoped_clearing() {
        let store = TabSecretStore::new();
        store.set(
            "tab-1",
            "host-a",
            TabSecretKind::Password,
            Zeroizing::new("pw-1".to_string()),
        );
        store.set(
            "tab-1",
            "host-a",
            TabSecretKind::KeyPassphrase,
            Zeroizing::new("pass-1".to_string()),
        );
        store.set(
            "tab-2",
            "host-a",
            TabSecretKind::Password,
            Zeroizing::new("pw-2".to_string()),
        );
        store.set(
            "tab-3",
            "host-b",
            TabSecretKind::KeyPassphrase,
            Zeroizing::new("pass-3".to_string()),
        );

        store.remove("tab-1", "host-a", TabSecretKind::Password);
        assert!(store
            .get("tab-1", "host-a", TabSecretKind::Password)
            .is_none());
        assert!(store
            .get("tab-1", "host-a", TabSecretKind::KeyPassphrase)
            .is_some());

        store.clear_tab("tab-1");
        assert!(store
            .get("tab-1", "host-a", TabSecretKind::KeyPassphrase)
            .is_none());
        assert!(store
            .get("tab-2", "host-a", TabSecretKind::Password)
            .is_some());

        store.clear_host("host-a");
        assert!(store
            .get("tab-2", "host-a", TabSecretKind::Password)
            .is_none());
        assert!(store
            .get("tab-3", "host-b", TabSecretKind::KeyPassphrase)
            .is_some());

        store.clear_all_passphrases();
        assert!(store
            .get("tab-3", "host-b", TabSecretKind::KeyPassphrase)
            .is_none());
    }

    #[test]
    fn ignores_blank_inputs() {
        let store = TabSecretStore::new();
        store.set(
            " ",
            "host-a",
            TabSecretKind::Password,
            Zeroizing::new("pw".to_string()),
        );
        store.set(
            "tab-1",
            "host-a",
            TabSecretKind::Password,
            Zeroizing::new(String::new()),
        );
        assert!(store
            .get("tab-1", "host-a", TabSecretKind::Password)
            .is_none());
    }
}
