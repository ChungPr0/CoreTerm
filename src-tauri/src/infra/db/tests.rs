use std::fs;
use std::path::Path;

use rusqlite::params;
use tempfile::tempdir;

use super::key_repo::MAX_KEY_NAME_LEN;
use super::SqliteDb;
use crate::hosts::HostService;
use crate::infra::security::SecretVault;
use crate::ipc::dto::{
    CreateHostRequestDto, GenerateSshKeyRequestDto, ImportSshKeyRequestDto, SavePortForwardDto,
    UpdateHostRequestDto, UpdateSshOptionsFieldsDto, UpsertPortForwardRequestDto,
};
use crate::keys::KeyService;

fn setup_services(dir: &Path) -> (SqliteDb, HostService, KeyService) {
    let db = SqliteDb::init(dir).expect("init database");
    let vault = SecretVault::new();
    let hosts = HostService::new(db.clone(), vault.clone());
    let keys = KeyService::new(db.clone(), vault, dir).expect("init key service");
    (db, hosts, keys)
}

#[test]
fn test_sqlite_schema_init_and_pragmas() {
    let dir = tempdir().expect("create temp dir");
    let db = SqliteDb::init(dir.path()).expect("init database");

    let conn = db.lock_conn().unwrap();
    let fk_enabled: i64 = conn
        .query_row("PRAGMA foreign_keys;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(fk_enabled, 1);

    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(journal_mode.to_lowercase(), "wal");

    for table in [
        "ssh_keys",
        "host_profiles",
        "ssh_options",
        "port_forwards",
    ] {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                params![table],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    let legacy_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='app_settings'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(legacy_count, 0);
}

#[test]
fn test_ed25519_key_generation_and_single_default_key_constraint() {
    let dir = tempdir().expect("create temp dir");
    let (_, _, keys) = setup_services(dir.path());

    let key1 = keys
        .generate(GenerateSshKeyRequestDto {
            name: "Primary Ed25519".to_string(),
            key_type: "ED25519".to_string(),
            comment: Some("admin@host".to_string()),
            passphrase: Some("s3cr3t-passphrase".to_string()),
            set_default: true,
        })
        .expect("generate first ed25519 key");

    assert_eq!(key1.key_type, "ED25519");
    assert!(key1.is_default);
    assert!(key1.has_passphrase);
    assert!(key1.has_saved_passphrase);
    assert!(key1.file_exists);
    assert!(key1
        .public_key_content
        .as_deref()
        .unwrap_or("")
        .starts_with("ssh-ed25519 "));
    assert!(key1.fingerprint.starts_with("SHA256:"));

    let stored_pw = keys
        .get_secret(&key1.id)
        .expect("read key secret")
        .expect("secret exists");
    assert_eq!(stored_pw.as_str(), "s3cr3t-passphrase");

    let key2 = keys
        .generate(GenerateSshKeyRequestDto {
            name: "Secondary Ed25519".to_string(),
            key_type: "ED25519".to_string(),
            comment: None,
            passphrase: None,
            set_default: true,
        })
        .expect("generate second ed25519 key as default");

    assert!(key2.is_default);

    let default_key = keys
        .get_default()
        .expect("query default key")
        .expect("default exists");
    assert_eq!(default_key.id, key2.id);

    let all_keys = keys.list().expect("list keys");
    let default_count = all_keys.iter().filter(|k| k.is_default).count();
    assert_eq!(default_count, 1);

    keys.set_default(Some(key1.id.clone()))
        .expect("switch default back to key1");
    let switched_default = keys.get_default().unwrap().unwrap();
    assert_eq!(switched_default.id, key1.id);
}

#[test]
fn test_host_profiles_crud_and_cascade() {
    let dir = tempdir().expect("create temp dir");
    let (_, hosts, keys) = setup_services(dir.path());

    let created_pw = hosts
        .create(CreateHostRequestDto {
            alias: "Prod API Server".to_string(),
            host: "192.168.1.100".to_string(),
            port: 2222,
            username: "ubuntu".to_string(),
            group_name: "Production".to_string(),
            tags: vec!["api".to_string(), "web".to_string()],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("SAVED".to_string()),
            password: Some("my-server-pw".to_string()),
            options: None,
            port_forwards: None,
        })
        .expect("create PASSWORD host");

    assert_eq!(created_pw.alias, "Prod API Server");
    assert_eq!(created_pw.password_mode, "SAVED");
    assert!(created_pw.has_saved_password);

    let saved_pw = hosts
        .get_secret(&created_pw.id)
        .expect("get host secret")
        .expect("host secret exists");
    assert_eq!(saved_pw.as_str(), "my-server-pw");

    let dummy_key_path = dir.path().join("id_ed25519_test");
    std::fs::write(&dummy_key_path, "DUMMY PRIVATE KEY CONTENT").unwrap();

    let created_key = hosts
        .create(CreateHostRequestDto {
            alias: "Staging DB".to_string(),
            host: "10.0.0.50".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Staging".to_string(),
            tags: vec!["db".to_string()],
            auth_method: "SSH_KEY".to_string(),
            ssh_key_id: None,
            private_key_path: Some(dummy_key_path.to_string_lossy().to_string()),
            password_mode: None,
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("create SSH_KEY host");

    assert_eq!(created_key.auth_method, "SSH_KEY");
    assert!(created_key.ssh_key_id.is_none());
    assert_eq!(
        created_key.private_key_path.as_deref(),
        Some(dummy_key_path.to_string_lossy().as_ref())
    );
    assert!(
        keys.list().expect("list keys").is_empty(),
        "private '--' key must not be auto-saved into Vault"
    );

    let all_hosts = hosts.list(None, None, None).expect("list all hosts");
    assert_eq!(all_hosts.len(), 2);

    let updated = hosts
        .update(UpdateHostRequestDto {
            id: created_pw.id.clone(),
            alias: "Prod API Server v2".to_string(),
            host: "192.168.1.101".to_string(),
            port: 2200,
            username: "admin".to_string(),
            group_name: "Production".to_string(),
            tags: vec!["api".to_string()],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("update host");

    assert_eq!(updated.alias, "Prod API Server v2");
    assert!(!updated.has_saved_password);

    let duplicated = hosts
        .duplicate(&created_pw.id, "Prod API Replica", "192.168.1.102")
        .expect("duplicate host");
    assert_ne!(duplicated.id, created_pw.id);

    let del_res = hosts.delete(&created_pw.id).expect("delete host");
    assert!(del_res.deleted);
    assert!(hosts.get_detail(&created_pw.id).is_err());
}

#[test]
fn test_vault_key_name_limits_and_duplicate_import_checks() {
    let dir = tempdir().expect("create temp dir");
    let (_, _, keys) = setup_services(dir.path());

    let too_long = "k".repeat(MAX_KEY_NAME_LEN + 1);
    assert!(keys
        .generate(GenerateSshKeyRequestDto {
            name: too_long.clone(),
            key_type: "ED25519".to_string(),
            comment: None,
            passphrase: None,
            set_default: false,
        })
        .is_err());

    let generated = keys
        .generate(GenerateSshKeyRequestDto {
            name: "Primary Key".to_string(),
            key_type: "ED25519".to_string(),
            comment: None,
            passphrase: None,
            set_default: true,
        })
        .expect("generate primary key");

    let dup_gen = keys.generate(GenerateSshKeyRequestDto {
        name: "  primary key ".to_string(),
        key_type: "ED25519".to_string(),
        comment: None,
        passphrase: None,
        set_default: false,
    });
    assert!(dup_gen.is_err());

    keys.delete(&generated.id, false)
        .expect("delete metadata only");
    assert!(Path::new(&generated.private_key_path).exists());

    assert!(keys
        .import(ImportSshKeyRequestDto {
            name: too_long,
            source_path: generated.private_key_path.clone(),
            copy_to_managed_dir: false,
            passphrase: None,
            set_default: false,
        })
        .is_err());

    let reimported = keys
        .import(ImportSshKeyRequestDto {
            name: "Reimported Key".to_string(),
            source_path: generated.private_key_path.clone(),
            copy_to_managed_dir: false,
            passphrase: None,
            set_default: true,
        })
        .expect("re-import existing file once");

    let dup_same_path = keys.import(ImportSshKeyRequestDto {
        name: "Another Name".to_string(),
        source_path: reimported.private_key_path.clone(),
        copy_to_managed_dir: false,
        passphrase: None,
        set_default: false,
    });
    assert!(dup_same_path.is_err());

    let copied_elsewhere = dir.path().join("external_copy_key");
    fs::copy(&reimported.private_key_path, &copied_elsewhere).expect("copy key externally");
    let dup_same_fp = keys.import(ImportSshKeyRequestDto {
        name: "Duplicate Fingerprint".to_string(),
        source_path: copied_elsewhere.to_string_lossy().to_string(),
        copy_to_managed_dir: true,
        passphrase: None,
        set_default: false,
    });
    assert!(dup_same_fp.is_err());

    assert_eq!(keys.list().unwrap().len(), 1);
    let imported_files = fs::read_dir(dir.path().join("keys"))
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().ends_with(".imported_key"))
        .count();
    assert_eq!(imported_files, 0);
}

#[test]
fn test_private_host_key_stays_isolated_from_vault() {
    let dir = tempdir().expect("create temp dir");
    let (_, hosts, keys) = setup_services(dir.path());

    let private_a = dir.path().join("private_host_a");
    let private_b = dir.path().join("private_host_b");
    fs::write(&private_a, "PRIVATE KEY A").unwrap();
    fs::write(&private_b, "PRIVATE KEY B").unwrap();
    let private_a_str = private_a.to_string_lossy().to_string();
    let private_b_str = private_b.to_string_lossy().to_string();

    let created = hosts
        .create(CreateHostRequestDto {
            alias: "Private Node".to_string(),
            host: "10.10.0.5".to_string(),
            port: 22,
            username: "ubuntu".to_string(),
            group_name: "Private".to_string(),
            tags: vec![],
            auth_method: "SSH_KEY".to_string(),
            ssh_key_id: None,
            private_key_path: Some(format!("\"{}\"", private_a_str)),
            password_mode: None,
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("create host with private '--' key");

    assert!(created.ssh_key_id.is_none());
    assert_eq!(created.private_key_path.as_deref(), Some(private_a_str.as_str()));
    assert!(keys.list().unwrap().is_empty());

    let summary_list = hosts.list(None, None, None).expect("list host");
    assert_eq!(summary_list.len(), 1);
    assert!(summary_list[0].ssh_key_id.is_none());
    assert!(summary_list[0].ssh_key_name.is_none());
    assert_eq!(
        summary_list[0].private_key_path.as_deref(),
        Some(private_a_str.as_str())
    );

    let duplicated = hosts
        .duplicate(&created.id, "Private Node Copy", "10.10.0.6")
        .expect("duplicate private-key host");
    assert!(duplicated.ssh_key_id.is_none());
    assert_eq!(
        duplicated.private_key_path.as_deref(),
        Some(private_a_str.as_str())
    );
    assert!(keys.list().unwrap().is_empty());

    let vault_key = keys
        .generate(GenerateSshKeyRequestDto {
            name: "Shared Vault Key".to_string(),
            key_type: "ED25519".to_string(),
            comment: None,
            passphrase: None,
            set_default: false,
        })
        .expect("generate Vault key");

    let linked = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Private Node".to_string(),
            host: "10.10.0.5".to_string(),
            port: 22,
            username: "ubuntu".to_string(),
            group_name: "Private".to_string(),
            tags: vec![],
            auth_method: "SSH_KEY".to_string(),
            ssh_key_id: Some(vault_key.id.clone()),
            private_key_path: None,
            password_mode: None,
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("bind Vault key");
    assert_eq!(linked.ssh_key_id.as_deref(), Some(vault_key.id.as_str()));
    assert_eq!(
        linked.private_key_path.as_deref(),
        Some(vault_key.private_key_path.as_str())
    );

    let relinked_private = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Private Node".to_string(),
            host: "10.10.0.5".to_string(),
            port: 22,
            username: "ubuntu".to_string(),
            group_name: "Private".to_string(),
            tags: vec![],
            auth_method: "SSH_KEY".to_string(),
            ssh_key_id: None,
            private_key_path: Some(private_b_str.clone()),
            password_mode: None,
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("switch back to '--' private key");
    assert!(relinked_private.ssh_key_id.is_none());
    assert_eq!(
        relinked_private.private_key_path.as_deref(),
        Some(private_b_str.as_str())
    );
    assert_eq!(keys.list().unwrap().len(), 1);

    let pw_mode = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Private Node".to_string(),
            host: "10.10.0.5".to_string(),
            port: 22,
            username: "ubuntu".to_string(),
            group_name: "Private".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("switch to PASSWORD");
    assert!(pw_mode.ssh_key_id.is_none());
    assert!(pw_mode.private_key_path.is_none());
}

#[test]
fn group_crud_and_move_profile_work_reliably() {
    let temp = tempdir().unwrap();
    let (_, hosts, _) = setup_services(temp.path());

    let created = hosts
        .create(CreateHostRequestDto {
            alias: "Chung".to_string(),
            host: "103.118.29.51".to_string(),
            port: 1174,
            username: "chung".to_string(),
            group_name: "Workstations".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("create host in custom group");

    assert_eq!(created.group_name, "Workstations");
    assert!(hosts.list_groups().unwrap().contains(&"Workstations".to_string()));

    assert!(hosts.create_group("   ").is_err());
    assert!(hosts.create_group(&"g".repeat(65)).is_err());
    assert!(hosts.create_group("bad\nname").is_err());
    assert!(hosts.create_group("workstations").is_err());

    let singapore = hosts.create_group("  Singapore  ").expect("create empty group");
    assert_eq!(singapore, "Singapore");
    assert_eq!(hosts.list_groups().unwrap(), vec!["Singapore", "Workstations"]);

    let moved = hosts
        .move_group(&created.id, "singapore")
        .expect("move connection into Singapore");
    assert_eq!(moved, "Singapore");
    assert_eq!(hosts.get_detail(&created.id).unwrap().group_name, "Singapore");
    assert!(hosts.list_groups().unwrap().contains(&"Workstations".to_string()));

    assert!(hosts.delete_group("Default").is_err());
    let deleted = hosts.delete_group("Singapore").expect("delete Singapore group");
    assert!(deleted.deleted);
    assert_eq!(hosts.get_detail(&created.id).unwrap().group_name, "Default");
    assert!(!hosts.list_groups().unwrap().contains(&"Singapore".to_string()));

    let alpha = hosts.create_group("Alpha").expect("create Alpha");
    assert_eq!(alpha, "Alpha");
    assert_eq!(
        hosts.list_groups().unwrap(),
        vec!["Default", "Alpha", "Workstations"]
    );

    let reordered = hosts
        .reorder_groups(vec![
            "Workstations".to_string(),
            "Default".to_string(),
            "Alpha".to_string(),
        ])
        .expect("reorder groups including Default");
    assert_eq!(reordered, vec!["Workstations", "Default", "Alpha"]);

    // New groups after custom ordering are appended cleanly at the end and survive reopen.
    hosts.create_group("Beta").expect("create Beta after reorder");
    drop(hosts);
    let (_, hosts_reopened, _) = setup_services(temp.path());
    assert_eq!(
        hosts_reopened.list_groups().unwrap(),
        vec!["Workstations", "Default", "Alpha", "Beta"]
    );
}

#[test]
fn test_atomic_host_and_port_forwards_save() {
    let temp = tempdir().unwrap();
    let (_, hosts, _) = setup_services(temp.path());

    let created = hosts
        .create(CreateHostRequestDto {
            alias: "Tunnel Host".to_string(),
            host: "10.0.0.10".to_string(),
            port: 22,
            username: "ops".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: Some(vec![
                SavePortForwardDto {
                    id: None,
                    label: "Postgres".to_string(),
                    forward_type: "LOCAL".to_string(),
                    bind_address: "127.0.0.1".to_string(),
                    bind_port: 5432,
                    target_host: Some("127.0.0.1".to_string()),
                    target_port: Some(5432),
                    is_enabled: true,
                },
                SavePortForwardDto {
                    id: None,
                    label: "SOCKS".to_string(),
                    forward_type: "DYNAMIC".to_string(),
                    bind_address: "127.0.0.1".to_string(),
                    bind_port: 1080,
                    target_host: None,
                    target_port: None,
                    is_enabled: true,
                },
            ]),
        })
        .expect("atomic create host + port forwards");

    assert_eq!(created.port_forwards.len(), 2);
    let kept_id = created.port_forwards[0].id.clone();

    let updated = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Tunnel Host".to_string(),
            host: "10.0.0.10".to_string(),
            port: 22,
            username: "ops".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: Some(vec![SavePortForwardDto {
                id: Some(kept_id.clone()),
                label: "Postgres Renamed".to_string(),
                forward_type: "LOCAL".to_string(),
                bind_address: "127.0.0.1".to_string(),
                bind_port: 15432,
                target_host: Some("127.0.0.1".to_string()),
                target_port: Some(5432),
                is_enabled: false,
            }]),
        })
        .expect("atomic update host + sync port forwards");

    assert_eq!(updated.port_forwards.len(), 1);
    assert_eq!(updated.port_forwards[0].id, kept_id);
    assert_eq!(updated.port_forwards[0].label, "Postgres Renamed");
    assert_eq!(updated.port_forwards[0].bind_port, 15432);
    assert!(!updated.port_forwards[0].is_enabled);
}

#[test]
fn test_upsert_port_forward_validates_bind_address_and_rejects_duplicates() {
    let temp = tempdir().unwrap();
    let (_, hosts, _) = setup_services(temp.path());

    let created = hosts
        .create(CreateHostRequestDto {
            alias: "PF Host".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: None,
        })
        .unwrap();

    let bad_bind = hosts.upsert_port_forward(UpsertPortForwardRequestDto {
        id: None,
        host_id: created.id.clone(),
        label: "Bad Bind".to_string(),
        forward_type: "LOCAL".to_string(),
        bind_address: "-invalid-addr;echo".to_string(),
        bind_port: 8080,
        target_host: Some("localhost".to_string()),
        target_port: Some(80),
        is_enabled: true,
    });
    assert!(bad_bind.is_err());

    let rule1 = hosts
        .upsert_port_forward(UpsertPortForwardRequestDto {
            id: None,
            host_id: created.id.clone(),
            label: "Rule 1".to_string(),
            forward_type: "LOCAL".to_string(),
            bind_address: "127.0.0.1".to_string(),
            bind_port: 8080,
            target_host: Some("localhost".to_string()),
            target_port: Some(80),
            is_enabled: true,
        })
        .expect("upsert rule 1");
    assert_eq!(rule1.bind_port, 8080);

    let dup_rule = hosts.upsert_port_forward(UpsertPortForwardRequestDto {
        id: None,
        host_id: created.id.clone(),
        label: "Rule 2 Dup".to_string(),
        forward_type: "DYNAMIC".to_string(),
        bind_address: "localhost".to_string(),
        bind_port: 8080,
        target_host: None,
        target_port: None,
        is_enabled: true,
    });
    assert!(dup_rule.is_err());

    let disabled_dup = hosts
        .upsert_port_forward(UpsertPortForwardRequestDto {
            id: None,
            host_id: created.id.clone(),
            label: "Rule 2 Disabled".to_string(),
            forward_type: "DYNAMIC".to_string(),
            bind_address: "localhost".to_string(),
            bind_port: 8080,
            target_host: None,
            target_port: None,
            is_enabled: false,
        })
        .expect("upsert disabled rule with duplicate port");
    assert!(!disabled_dup.is_enabled);
}

#[test]
fn test_auto_reconnect_only_allowed_with_saved_password_or_ssh_key() {
    let temp = tempdir().unwrap();
    let (_, hosts, _) = setup_services(temp.path());

    // 1. Password with PROMPT_EVERY_TIME: auto_reconnect forced to false
    let host_prompt = hosts
        .create(CreateHostRequestDto {
            alias: "Prompt Host".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: Some(UpdateSshOptionsFieldsDto {
                auto_reconnect: Some(true),
                ..Default::default()
            }),
            port_forwards: None,
        })
        .expect("create host");
    assert!(!host_prompt.options.auto_reconnect);

    // 2. Password with SAVED: auto_reconnect permitted
    let host_saved = hosts
        .create(CreateHostRequestDto {
            alias: "Saved Host".to_string(),
            host: "10.0.0.2".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("SAVED".to_string()),
            password: Some("secret123".to_string()),
            options: Some(UpdateSshOptionsFieldsDto {
                auto_reconnect: Some(true),
                ..Default::default()
            }),
            port_forwards: None,
        })
        .expect("create host with saved password");
    assert!(host_saved.options.auto_reconnect);

    // Updating to PROMPT_EVERY_TIME automatically turns off auto_reconnect
    let updated = hosts
        .update(UpdateHostRequestDto {
            id: host_saved.id,
            alias: "Saved Host".to_string(),
            host: "10.0.0.2".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: Some(UpdateSshOptionsFieldsDto {
                auto_reconnect: Some(true),
                ..Default::default()
            }),
            port_forwards: None,
        })
        .expect("update to prompt");
    assert!(!updated.options.auto_reconnect);
}

#[test]
fn test_saved_password_mode_requires_password_when_no_existing_secret() {
    let dir = tempfile::tempdir().unwrap();
    let db = SqliteDb::init(dir.path()).unwrap();
    let vault = SecretVault::new();
    let hosts = HostService::new(db, vault);

    let err = hosts
        .create(CreateHostRequestDto {
        alias: "Saved Empty".to_string(),
        host: "10.0.0.1".to_string(),
        port: 22,
        username: "root".to_string(),
        group_name: "Default".to_string(),
        tags: vec![],
        auth_method: "PASSWORD".to_string(),
        ssh_key_id: None,
        private_key_path: None,
        password_mode: Some("SAVED".to_string()),
        password: None,
        options: None,
        port_forwards: None,
    });
    assert!(err.is_err(), "Creation without password in SAVED mode must fail");

    let created = hosts
        .create(CreateHostRequestDto {
            alias: "Saved Valid".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("SAVED".to_string()),
            password: Some("pass-123".to_string()),
            options: None,
            port_forwards: None,
        })
        .expect("create host with saved password");
    assert!(created.has_saved_password);

    let updated_kept = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Saved Valid".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("SAVED".to_string()),
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("update keeps saved password");
    assert!(updated_kept.has_saved_password);

    let updated_prompt = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Saved Valid".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("PROMPT_EVERY_TIME".to_string()),
            password: None,
            options: None,
            port_forwards: None,
        })
        .expect("switch to prompt");
    assert!(!updated_prompt.has_saved_password);

    let err_update = hosts.update(UpdateHostRequestDto {
        id: created.id.clone(),
        alias: "Saved Valid".to_string(),
        host: "10.0.0.1".to_string(),
        port: 22,
        username: "root".to_string(),
        group_name: "Default".to_string(),
        tags: vec![],
        auth_method: "PASSWORD".to_string(),
        ssh_key_id: None,
        private_key_path: None,
        password_mode: Some("SAVED".to_string()),
        password: None,
        options: None,
        port_forwards: None,
    });
    assert!(
        err_update.is_err(),
        "Switching back to SAVED without password after deletion must fail"
    );

    let updated_saved_again = hosts
        .update(UpdateHostRequestDto {
            id: created.id.clone(),
            alias: "Saved Valid".to_string(),
            host: "10.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            group_name: "Default".to_string(),
            tags: vec![],
            auth_method: "PASSWORD".to_string(),
            ssh_key_id: None,
            private_key_path: None,
            password_mode: Some("SAVED".to_string()),
            password: Some("new-pass-456".to_string()),
            options: None,
            port_forwards: None,
        })
        .expect("update back to saved with new password");
    assert!(updated_saved_again.has_saved_password);
}
