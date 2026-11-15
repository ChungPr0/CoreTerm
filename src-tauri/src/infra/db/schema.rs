use rusqlite::Connection;

use crate::core::error::CoreResult;

pub const PRAGMA_INIT_SQL: &str = r#"
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
"#;

pub const SCHEMA_DDL_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS ssh_keys (
    id                  TEXT PRIMARY KEY NOT NULL,
    name                TEXT NOT NULL,
    key_type            TEXT NOT NULL CHECK (key_type IN ('ED25519', 'RSA_4096', 'ECDSA', 'IMPORTED')),
    private_key_path    TEXT NOT NULL UNIQUE,
    public_key_content  TEXT,
    fingerprint         TEXT NOT NULL,
    has_passphrase      INTEGER NOT NULL DEFAULT 0 CHECK (has_passphrase IN (0, 1)),
    secret_ref_id       TEXT,
    is_default          INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssh_keys_single_default
ON ssh_keys (is_default)
WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS host_profiles (
    id                  TEXT PRIMARY KEY NOT NULL,
    alias               TEXT NOT NULL,
    host                TEXT NOT NULL,
    port                INTEGER NOT NULL DEFAULT 22 CHECK (port BETWEEN 1 AND 65535),
    username            TEXT NOT NULL,
    group_name          TEXT NOT NULL DEFAULT 'Default',
    tags_json           TEXT NOT NULL DEFAULT '[]',
    auth_method         TEXT NOT NULL CHECK (auth_method IN ('SSH_KEY', 'PASSWORD')),
    ssh_key_id          TEXT REFERENCES ssh_keys(id) ON DELETE SET NULL,
    private_key_path    TEXT DEFAULT NULL,
    password_mode       TEXT NOT NULL DEFAULT 'NONE' CHECK (password_mode IN ('SAVED', 'PROMPT_EVERY_TIME', 'NONE')),
    secret_ref_id       TEXT,
    last_connected_at   TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK (
        (auth_method = 'PASSWORD' AND password_mode IN ('SAVED', 'PROMPT_EVERY_TIME')) OR
        (auth_method = 'SSH_KEY')
    )
);

CREATE INDEX IF NOT EXISTS idx_host_profiles_group ON host_profiles(group_name);
CREATE INDEX IF NOT EXISTS idx_host_profiles_ssh_key ON host_profiles(ssh_key_id);
CREATE INDEX IF NOT EXISTS idx_host_profiles_last_connected ON host_profiles(last_connected_at DESC);

CREATE TABLE IF NOT EXISTS host_groups (
    name        TEXT PRIMARY KEY NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ssh_options (
    host_id                      TEXT PRIMARY KEY NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
    server_alive_interval       INTEGER NOT NULL DEFAULT 60 CHECK (server_alive_interval BETWEEN 0 AND 3600),
    server_alive_count_max      INTEGER NOT NULL DEFAULT 3 CHECK (server_alive_count_max BETWEEN 1 AND 20),
    compression                 INTEGER NOT NULL DEFAULT 0 CHECK (compression IN (0, 1)),
    strict_host_key_checking    TEXT NOT NULL DEFAULT 'ACCEPT_NEW' CHECK (strict_host_key_checking IN ('ACCEPT_NEW', 'YES', 'NO')),
    startup_command             TEXT DEFAULT NULL,
    forward_agent               INTEGER NOT NULL DEFAULT 0 CHECK (forward_agent IN (0, 1)),
    telemetry_enabled           INTEGER NOT NULL DEFAULT 0 CHECK (telemetry_enabled IN (0, 1)),
    telemetry_interval_sec      INTEGER NOT NULL DEFAULT 2 CHECK (telemetry_interval_sec BETWEEN 1 AND 60),
    auto_reconnect              INTEGER NOT NULL DEFAULT 0 CHECK (auto_reconnect IN (0, 1)),
    reconnect_interval_sec      INTEGER NOT NULL DEFAULT 2 CHECK (reconnect_interval_sec BETWEEN 1 AND 60),
    updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS port_forwards (
    id              TEXT PRIMARY KEY NOT NULL,
    host_id          TEXT NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
    label           TEXT NOT NULL DEFAULT '',
    forward_type    TEXT NOT NULL CHECK (forward_type IN ('LOCAL', 'REMOTE', 'DYNAMIC')),
    bind_address    TEXT NOT NULL DEFAULT '127.0.0.1',
    bind_port       INTEGER NOT NULL CHECK (bind_port BETWEEN 1 AND 65535),
    target_host     TEXT,
    target_port     INTEGER CHECK (target_port IS NULL OR (target_port BETWEEN 1 AND 65535)),
    is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK (
        (forward_type IN ('LOCAL', 'REMOTE') AND target_host IS NOT NULL AND target_port IS NOT NULL) OR
        (forward_type = 'DYNAMIC' AND target_host IS NULL AND target_port IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_port_forwards_host_enabled ON port_forwards(host_id, is_enabled);
"#;

pub fn configure_and_migrate(conn: &Connection) -> CoreResult<()> {
    conn.execute_batch(PRAGMA_INIT_SQL)?;
    conn.execute_batch(SCHEMA_DDL_SQL)?;
    let has_sort_order: bool = conn
        .prepare("PRAGMA table_info(host_groups)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(Result::ok)
        .any(|col| col == "sort_order");
    if !has_sort_order {
        conn.execute(
            "ALTER TABLE host_groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    // Settings moved to localStorage; clean up legacy table on existing DBs.
    conn.execute("DROP TABLE IF EXISTS app_settings", [])?;
    let _ = conn.execute(
        "INSERT OR IGNORE INTO host_groups (name) SELECT DISTINCT TRIM(group_name) FROM host_profiles WHERE TRIM(group_name) <> ''",
        [],
    );
    Ok(())
}
