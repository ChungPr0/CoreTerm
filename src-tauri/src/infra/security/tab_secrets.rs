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

#[derive(Clone)]
struct TabSecretValue {
    secret: Zeroizing<String>,
    key_id: Option<String>,
}

#[derive(Clone, Default)]
pub struct TabSecretStore {
    entries: Arc<DashMap<TabSecretKey, TabSecretValue>>,
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
        self.entries.get(&key).map(|entry| entry.value().secret.clone())
    }

    pub fn set(
        &self,
        tab_id: &str,
        host_id: &str,
        kind: TabSecretKind,
        secret: Zeroizing<String>,
    ) {
        self.set_with_key(tab_id, host_id, kind, secret, None);
    }

    pub fn set_with_key(
        &self,
        tab_id: &str,
        host_id: &str,
        kind: TabSecretKind,
        secret: Zeroizing<String>,
        key_id: Option<&str>,
    ) {
        let tab = tab_id.trim();
        let host = host_id.trim();
        if tab.is_empty() || host.is_empty() || secret.is_empty() {
            return;
        }
        let clean_key_id = key_id
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let key = TabSecretKey {
            tab_id: tab.to_string(),
            host_id: host.to_string(),
            kind,
        };
        self.entries.insert(
            key,
            TabSecretValue {
                secret,
                key_id: clean_key_id,
            },
        );
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

    pub fn clear_key(&self, key_id: &str) {
        let trimmed = key_id.trim();
        if trimmed.is_empty() {
            return;
        }
        self.entries.retain(|k, v| {
            !(k.kind == TabSecretKind::KeyPassphrase && v.key_id.as_deref() == Some(trimmed))
        });
    }

    #[allow(dead_code)]
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

    #[test]
    fn clear_key_removes_only_matching_key_passphrases() {
        let store = TabSecretStore::new();
        store.set_with_key(
            "tab-1",
            "host-a",
            TabSecretKind::KeyPassphrase,
            Zeroizing::new("pass-a".to_string()),
            Some("key-1"),
        );
        store.set_with_key(
            "tab-2",
            "host-b",
            TabSecretKind::KeyPassphrase,
            Zeroizing::new("pass-b".to_string()),
            Some("key-2"),
        );
        store.set_with_key(
            "tab-3",
            "host-c",
            TabSecretKind::Password,
            Zeroizing::new("pw-c".to_string()),
            Some("key-1"),
        );

        store.clear_key("key-1");

        assert!(store
            .get("tab-1", "host-a", TabSecretKind::KeyPassphrase)
            .is_none());
        assert_eq!(
            store
                .get("tab-2", "host-b", TabSecretKind::KeyPassphrase)
                .as_deref()
                .map(String::as_str),
            Some("pass-b")
        );
        assert_eq!(
            store
                .get("tab-3", "host-c", TabSecretKind::Password)
                .as_deref()
                .map(String::as_str),
            Some("pw-c")
        );
    }
}
