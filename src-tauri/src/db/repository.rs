use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::db::schema::configure_and_migrate;
use crate::ipc::dto::{
    CreateHostRequestDto, DeleteResultDto, GenerateSshKeyRequestDto, ImportSshKeyRequestDto,
    PortForwardRuleDto, PortForwardToggleResultDto, SshKeyDto, SshOptionsDto,
    UpdateDefaultKeyResultDto, UpdateHostRequestDto, UpdateSshOptionsFieldsDto,
    UpsertPortForwardRequestDto, HostFullConfigDto, HostProfileSummaryDto,
};
use crate::ipc::error::{AppError, AppResult};
use crate::keys::SshKeyEngine;
use crate::security::SecretVault;

const MAX_KEY_NAME_LEN: usize = 64;
const MAX_GROUP_NAME_LEN: usize = 64;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    app_data_dir: PathBuf,
    secret_vault: SecretVault,
}

impl Database {
    pub fn init(app_data_dir: &Path) -> AppResult<Self> {
        let data_dir = app_data_dir.join("data");
        fs::create_dir_all(&data_dir)?;
        let keys_dir = app_data_dir.join("keys");
        fs::create_dir_all(&keys_dir)?;

        let db_path = data_dir.join("app.db");
        let conn = Connection::open(&db_path)?;
        configure_and_migrate(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            app_data_dir: app_data_dir.to_path_buf(),
            secret_vault: SecretVault::new(),
        })
    }

    pub fn init_in_memory(temp_dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(temp_dir.join("keys"))?;
        let conn = Connection::open_in_memory()?;
        configure_and_migrate(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            app_data_dir: temp_dir.to_path_buf(),
            secret_vault: SecretVault::new(),
        })
    }

    pub fn secret_vault(&self) -> &SecretVault {
        &self.secret_vault
    }

    fn lock_conn(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|e| AppError::Internal(format!("Database mutex poisoned: {e}")))
    }

    pub fn key_list(&self) -> AppResult<Vec<SshKeyDto>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, key_type, private_key_path, public_key_content,
                   fingerprint, has_passphrase, secret_ref_id, is_default, created_at
            FROM ssh_keys
            ORDER BY is_default DESC, created_at DESC
            "#,
        )?;

        let rows = stmt.query_map([], |row| {
            let private_key_path: String = row.get(3)?;
            let has_passphrase: i64 = row.get(6)?;
            let secret_ref_id: Option<String> = row.get(7)?;
            let is_default: i64 = row.get(8)?;
            let file_exists = Path::new(&private_key_path).exists();

            Ok(SshKeyDto {
                id: row.get(0)?,
                name: row.get(1)?,
                key_type: row.get(2)?,
                private_key_path,
                public_key_content: row.get(4)?,
                fingerprint: row.get(5)?,
                has_passphrase: has_passphrase != 0,
                has_saved_passphrase: secret_ref_id.is_some(),
                is_default: is_default != 0,
                file_exists,
                created_at: row.get(9)?,
            })
        })?;

        let mut keys = Vec::new();
        for item in rows {
            keys.push(item?);
        }
        Ok(keys)
    }

    pub fn key_get_default(&self) -> AppResult<Option<SshKeyDto>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, key_type, private_key_path, public_key_content,
                   fingerprint, has_passphrase, secret_ref_id, is_default, created_at
            FROM ssh_keys
            WHERE is_default = 1
            LIMIT 1
            "#,
        )?;

        let result = stmt
            .query_row([], |row| {
                let private_key_path: String = row.get(3)?;
                let has_passphrase: i64 = row.get(6)?;
                let secret_ref_id: Option<String> = row.get(7)?;
                let is_default: i64 = row.get(8)?;
                Ok(SshKeyDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    key_type: row.get(2)?,
                    file_exists: Path::new(&private_key_path).exists(),
                    private_key_path,
                    public_key_content: row.get(4)?,
                    fingerprint: row.get(5)?,
                    has_passphrase: has_passphrase != 0,
                    has_saved_passphrase: secret_ref_id.is_some(),
                    is_default: is_default != 0,
                    created_at: row.get(9)?,
                })
            })
            .optional()?;

        Ok(result)
    }

    fn normalize_key_path_input(raw: &str) -> String {
        let trimmed = raw.trim();
        if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
            trimmed[1..trimmed.len() - 1].trim().to_string()
        } else {
            trimmed.to_string()
        }
    }

    fn validate_entity_name(raw_name: &str, label: &str, max_len: usize) -> AppResult<String> {
        let trimmed = raw_name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(format!("{label} cannot be empty")));
        }
        if trimmed.chars().count() > max_len {
            return Err(AppError::Validation(format!(
                "{label} cannot exceed {max_len} characters"
            )));
        }
        if trimmed.chars().any(|c| c.is_control()) {
            return Err(AppError::Validation(format!(
                "{label} contains invalid control characters"
            )));
        }
        Ok(trimmed.to_string())
    }

    fn validate_vault_key_name(conn: &Connection, raw_name: &str) -> AppResult<String> {
        let trimmed = Self::validate_entity_name(raw_name, "Key name", MAX_KEY_NAME_LEN)?;

        let duplicate: Option<String> = conn
            .query_row(
                "SELECT id FROM ssh_keys WHERE LOWER(TRIM(name)) = LOWER(?1) LIMIT 1",
                params![trimmed],
                |row| row.get(0),
            )
            .optional()?;
        if duplicate.is_some() {
            return Err(AppError::Validation(format!(
                "Key name \"{trimmed}\" already exists. Please choose a different name."
            )));
        }

        Ok(trimmed)
    }

    /// Resolves a profile's group name cleanly, reusing existing canonical casing and persisting custom groups.
    fn resolve_canonical_group_name(conn: &Connection, raw_group: &str) -> AppResult<String> {
        let trimmed = raw_group.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default") {
            return Ok("Default".to_string());
        }
        let validated = Self::validate_entity_name(trimmed, "Group name", MAX_GROUP_NAME_LEN)?;
        let existing: Option<String> = conn
            .query_row(
                "SELECT name FROM host_groups WHERE LOWER(TRIM(name)) = LOWER(?1) LIMIT 1",
                params![validated],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(canon) = existing {
            return Ok(canon);
        }
        let existing_in_profiles: Option<String> = conn
            .query_row(
                "SELECT group_name FROM host_profiles WHERE LOWER(TRIM(group_name)) = LOWER(?1) LIMIT 1",
                params![validated],
                |r| r.get(0),
            )
            .optional()?;
        let canonical = existing_in_profiles.unwrap_or(validated);
        conn.execute(
            "INSERT OR IGNORE INTO host_groups (name) VALUES (?1)",
            params![canonical],
        )?;
        Ok(canonical)
    }

    pub fn host_group_list(&self) -> AppResult<Vec<String>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT name FROM (
                SELECT name FROM host_groups
                UNION
                SELECT DISTINCT TRIM(group_name) AS name FROM host_profiles WHERE TRIM(group_name) <> ''
            )
            ORDER BY CASE WHEN LOWER(name) = 'default' THEN 0 ELSE 1 END, LOWER(name) ASC, name ASC
            "#,
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut groups = Vec::new();
        for row in rows {
            groups.push(row?);
        }
        Ok(groups)
    }

    pub fn host_group_create(&self, raw_name: &str) -> AppResult<String> {
        let validated = Self::validate_entity_name(raw_name, "Group name", MAX_GROUP_NAME_LEN)?;
        let conn = self.lock_conn()?;
        let dup_group: Option<String> = conn
            .query_row(
                r#"
                SELECT name FROM (
                    SELECT name FROM host_groups
                    UNION
                    SELECT DISTINCT TRIM(group_name) AS name FROM host_profiles WHERE TRIM(group_name) <> ''
                )
                WHERE LOWER(TRIM(name)) = LOWER(?1)
                LIMIT 1
                "#,
                params![validated],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(existing) = dup_group {
            return Err(AppError::Validation(format!(
                "Group name \"{existing}\" already exists"
            )));
        }
        conn.execute(
            "INSERT INTO host_groups (name) VALUES (?1)",
            params![validated],
        )?;
        Ok(validated)
    }

    pub fn host_group_delete(&self, raw_name: &str) -> AppResult<DeleteResultDto> {
        let trimmed = raw_name.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default") {
            return Err(AppError::Validation(
                "Cannot delete Default group".to_string(),
            ));
        }
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let moved_profiles = tx.execute(
            r#"
            UPDATE host_profiles
            SET group_name = 'Default',
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE LOWER(TRIM(group_name)) = LOWER(?1)
            "#,
            params![trimmed],
        )?;
        let deleted_group = tx.execute(
            "DELETE FROM host_groups WHERE LOWER(TRIM(name)) = LOWER(?1)",
            params![trimmed],
        )?;
        tx.commit()?;
        Ok(DeleteResultDto {
            deleted: deleted_group > 0 || moved_profiles > 0,
        })
    }

    pub fn host_move_group(&self, host_id: &str, raw_group: &str) -> AppResult<String> {
        let mut conn = self.lock_conn()?;
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM host_profiles WHERE id = ?1",
                params![host_id],
                |r| r.get(0),
            )
            .optional()?;
        if exists.is_none() {
            return Err(AppError::NotFound(format!("Host profile not found: {host_id}")));
        }

        let tx = conn.transaction()?;
        let canonical = Self::resolve_canonical_group_name(&tx, raw_group)?;
        tx.execute(
            r#"
            UPDATE host_profiles
            SET group_name = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ?1
            "#,
            params![host_id, canonical],
        )?;
        tx.commit()?;
        Ok(canonical)
    }

    fn find_existing_key_by_path(
        conn: &Connection,
        path: &str,
    ) -> AppResult<Option<(String, String)>> {
        let sql = if cfg!(windows) {
            "SELECT id, name FROM ssh_keys WHERE LOWER(private_key_path) = LOWER(?1) LIMIT 1"
        } else {
            "SELECT id, name FROM ssh_keys WHERE private_key_path = ?1 LIMIT 1"
        };
        Ok(conn
            .query_row(sql, params![path], |row| Ok((row.get(0)?, row.get(1)?)))
            .optional()?)
    }

    #[allow(clippy::too_many_arguments)]
    fn insert_ssh_key_record(
        conn: &mut Connection,
        secret_vault: &SecretVault,
        key_id: &str,
        name: &str,
        key_type: &str,
        private_key_path: &str,
        public_key_content: Option<&str>,
        fingerprint: &str,
        has_passphrase: bool,
        passphrase: Option<&str>,
        set_default: bool,
    ) -> AppResult<SshKeyDto> {
        let secret_ref_id = if let Some(pw) = passphrase.filter(|p| !p.is_empty()) {
            let ref_id = SecretVault::key_passphrase_ref(key_id);
            secret_vault.store_secret(&ref_id, pw)?;
            Some(ref_id)
        } else {
            None
        };

        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if set_default {
            tx.execute("UPDATE ssh_keys SET is_default = 0 WHERE is_default = 1", [])?;
        }
        tx.execute(
            r#"
            INSERT INTO ssh_keys (
                id, name, key_type, private_key_path, public_key_content,
                fingerprint, has_passphrase, secret_ref_id, is_default
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                key_id,
                name,
                key_type,
                private_key_path,
                public_key_content,
                fingerprint,
                if has_passphrase { 1 } else { 0 },
                secret_ref_id,
                if set_default { 1 } else { 0 },
            ],
        )?;
        tx.commit()?;

        Self::get_key_by_id_internal(conn, key_id)
    }

    pub fn key_generate(&self, req: GenerateSshKeyRequestDto) -> AppResult<SshKeyDto> {
        let name = {
            let conn = self.lock_conn()?;
            Self::validate_vault_key_name(&conn, &req.name)?
        };

        let key_id = Uuid::new_v4().to_string();
        let keys_dir = self.app_data_dir.join("keys");
        let generated = SshKeyEngine::generate_keypair(
            &keys_dir,
            &key_id,
            req.key_type.trim(),
            req.comment.as_deref(),
            req.passphrase.as_deref(),
        )?;

        let mut conn = self.lock_conn()?;
        if let Err(err) = Self::validate_vault_key_name(&conn, &name) {
            let _ = fs::remove_file(&generated.private_key_path);
            let _ = fs::remove_file(format!("{}.pub", generated.private_key_path.to_string_lossy()));
            return Err(err);
        }

        Self::insert_ssh_key_record(
            &mut conn,
            &self.secret_vault,
            &key_id,
            &name,
            &generated.key_type,
            &generated.private_key_path.to_string_lossy(),
            Some(&generated.public_key_content),
            &generated.fingerprint,
            generated.has_passphrase,
            req.passphrase.as_deref(),
            req.set_default,
        )
    }

    pub fn key_import(&self, req: ImportSshKeyRequestDto) -> AppResult<SshKeyDto> {
        let clean_path = Self::normalize_key_path_input(&req.source_path);
        if clean_path.is_empty() {
            return Err(AppError::Validation(
                "Private key path cannot be empty".to_string(),
            ));
        }

        let mut conn = self.lock_conn()?;
        let name = Self::validate_vault_key_name(&conn, &req.name)?;

        let src_path = Path::new(&clean_path);
        if !src_path.is_file() {
            return Err(AppError::Validation(format!(
                "Key file not found: {clean_path}"
            )));
        }

        if let Some((_, existing_name)) = Self::find_existing_key_by_path(&conn, &clean_path)? {
            return Err(AppError::Validation(format!(
                "This key file is already in Vault as \"{existing_name}\"."
            )));
        }

        let has_pw_hint = req
            .passphrase
            .as_ref()
            .map(|p| !p.is_empty())
            .unwrap_or(false);
        let preview = SshKeyEngine::inspect_key_file(src_path, has_pw_hint);

        let dup_fp: Option<String> = conn
            .query_row(
                "SELECT name FROM ssh_keys WHERE fingerprint = ?1 LIMIT 1",
                params![preview.fingerprint],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(existing_name) = dup_fp {
            return Err(AppError::Validation(format!(
                "This SSH key already exists in Vault as \"{existing_name}\" (duplicate key fingerprint)."
            )));
        }

        let key_id = Uuid::new_v4().to_string();
        let keys_dir = self.app_data_dir.join("keys");
        let inspected = SshKeyEngine::import_key_file(
            &keys_dir,
            &key_id,
            src_path,
            req.copy_to_managed_dir,
            has_pw_hint,
        )?;

        Self::insert_ssh_key_record(
            &mut conn,
            &self.secret_vault,
            &key_id,
            &name,
            &inspected.key_type,
            &inspected.private_key_path.to_string_lossy(),
            inspected.public_key_content.as_deref(),
            &inspected.fingerprint,
            inspected.has_passphrase,
            req.passphrase.as_deref(),
            req.set_default,
        )
    }

    /// Resolves key binding for a host profile without auto-importing raw paths into `ssh_keys`.
    /// Vault-selected keys link via `(Some(ssh_key_id), None)`, while custom `--` paths stay
    /// private on `host_profiles.private_key_path` as `(None, Some(clean_path))`.
    fn resolve_host_key_binding(
        conn: &Connection,
        auth_method: &str,
        ssh_key_id: Option<&str>,
        private_key_path: Option<&str>,
    ) -> AppResult<(Option<String>, Option<String>)> {
        if auth_method != "SSH_KEY" {
            return Ok((None, None));
        }

        if let Some(id) = ssh_key_id.map(str::trim).filter(|s| !s.is_empty()) {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM ssh_keys WHERE id = ?1 LIMIT 1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()?;
            if exists.is_none() {
                return Err(AppError::NotFound(format!(
                    "SSH key not found in Vault: {id}"
                )));
            }
            return Ok((Some(id.to_string()), None));
        }

        let clean_path = private_key_path
            .map(Self::normalize_key_path_input)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::Validation(
                    "SSH Key authentication requires selecting a key or providing a Key Path."
                        .to_string(),
                )
            })?;

        let key_path = Path::new(&clean_path);
        if key_path.exists() {
            let _ = crate::os::restrict_private_key_acl(key_path);
        }

        Ok((None, Some(clean_path)))
    }

    fn get_key_by_id_internal(conn: &Connection, key_id: &str) -> AppResult<SshKeyDto> {
        conn.query_row(
            r#"
            SELECT id, name, key_type, private_key_path, public_key_content,
                   fingerprint, has_passphrase, secret_ref_id, is_default, created_at
            FROM ssh_keys
            WHERE id = ?1
            "#,
            params![key_id],
            |row| {
                let private_key_path: String = row.get(3)?;
                let has_passphrase: i64 = row.get(6)?;
                let secret_ref_id: Option<String> = row.get(7)?;
                let is_default: i64 = row.get(8)?;
                Ok(SshKeyDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    key_type: row.get(2)?,
                    file_exists: Path::new(&private_key_path).exists(),
                    private_key_path,
                    public_key_content: row.get(4)?,
                    fingerprint: row.get(5)?,
                    has_passphrase: has_passphrase != 0,
                    has_saved_passphrase: secret_ref_id.is_some(),
                    is_default: is_default != 0,
                    created_at: row.get(9)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("SSH Key not found: {key_id}")))
    }

    pub fn key_set_default(&self, key_id: Option<String>) -> AppResult<UpdateDefaultKeyResultDto> {
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute("UPDATE ssh_keys SET is_default = 0 WHERE is_default = 1", [])?;
        if let Some(id) = key_id.filter(|s| !s.trim().is_empty()) {
            let affected = tx.execute(
                "UPDATE ssh_keys SET is_default = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
                params![id],
            )?;
            if affected == 0 {
                return Err(AppError::NotFound(format!("SSH Key not found: {id}")));
            }
        }
        tx.commit()?;
        Ok(UpdateDefaultKeyResultDto { updated: true })
    }

    pub fn key_delete(
        &self,
        key_id: &str,
        delete_file_from_disk: bool,
    ) -> AppResult<DeleteResultDto> {
        let conn = self.lock_conn()?;
        let key_opt: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT private_key_path, secret_ref_id FROM ssh_keys WHERE id = ?1",
                params![key_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;

        let affected = conn.execute("DELETE FROM ssh_keys WHERE id = ?1", params![key_id])?;

        if let Some((priv_path, secret_ref)) = key_opt {
            if let Some(ref_id) = secret_ref {
                let _ = self.secret_vault.delete_secret(&ref_id);
            }
            if delete_file_from_disk {
                let _ = fs::remove_file(&priv_path);
                let _ = fs::remove_file(format!("{priv_path}.pub"));
            }
        }

        Ok(DeleteResultDto {
            deleted: affected > 0,
        })
    }

    pub fn get_host_secret(&self, host_id: &str) -> AppResult<Option<Zeroizing<String>>> {
        let conn = self.lock_conn()?;
        let secret_ref: Option<Option<String>> = conn
            .query_row(
                "SELECT secret_ref_id FROM host_profiles WHERE id = ?1",
                params![host_id],
                |r| r.get(0),
            )
            .optional()?;

        if let Some(Some(ref_id)) = secret_ref {
            return self.secret_vault.get_secret(&ref_id);
        }
        Ok(None)
    }

    pub fn save_host_secret(&self, host_id: &str, secret: &str) -> AppResult<()> {
        let ref_id = SecretVault::host_password_ref(host_id);
        self.secret_vault.store_secret(&ref_id, secret)?;
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE host_profiles SET password_mode = 'SAVED', secret_ref_id = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            params![host_id, ref_id],
        )?;
        Ok(())
    }

    pub fn get_key_secret(&self, key_id: &str) -> AppResult<Option<Zeroizing<String>>> {
        let conn = self.lock_conn()?;
        let secret_ref: Option<Option<String>> = conn
            .query_row(
                "SELECT secret_ref_id FROM ssh_keys WHERE id = ?1",
                params![key_id],
                |r| r.get(0),
            )
            .optional()?;

        if let Some(Some(ref_id)) = secret_ref {
            return self.secret_vault.get_secret(&ref_id);
        }
        Ok(None)
    }

    pub fn save_key_secret(&self, key_id: &str, secret: &str) -> AppResult<()> {
        let ref_id = SecretVault::key_passphrase_ref(key_id);
        self.secret_vault.store_secret(&ref_id, secret)?;
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE ssh_keys SET has_passphrase = 1, secret_ref_id = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            params![key_id, ref_id],
        )?;
        Ok(())
    }

    pub fn host_list(
        &self,
        group_filter: Option<String>,
        tag_filter: Option<String>,
        search_query: Option<String>,
    ) -> AppResult<Vec<HostProfileSummaryDto>> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"
            SELECT
                v.id,
                v.alias,
                v.host,
                v.port,
                v.username,
                v.group_name,
                v.tags_json,
                v.auth_method,
                v.ssh_key_id,
                k.name AS ssh_key_name,
                COALESCE(k.private_key_path, v.private_key_path) AS private_key_path,
                v.password_mode,
                v.secret_ref_id,
                (SELECT COUNT(*) FROM port_forwards pf WHERE pf.host_id = v.id AND pf.is_enabled = 1) AS active_pf_count,
                COALESCE(o.telemetry_enabled, 0) AS telemetry_enabled,
                COALESCE(o.telemetry_interval_sec, 2) AS telemetry_interval_sec,
                COALESCE(o.auto_reconnect, 0) AS auto_reconnect,
                COALESCE(o.reconnect_interval_sec, 2) AS reconnect_interval_sec,
                v.last_connected_at,
                v.created_at,
                v.updated_at
            FROM host_profiles v
            LEFT JOIN ssh_keys k ON v.ssh_key_id = k.id
            LEFT JOIN ssh_options o ON v.id = o.host_id
            ORDER BY v.group_name ASC, v.alias ASC
            "#,
        )?;

        let rows = stmt.query_map([], |row| {
            let tags_json: String = row.get(6)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let secret_ref_id: Option<String> = row.get(12)?;
            let active_pf_count: i64 = row.get(13)?;
            let telemetry_enabled: i64 = row.get(14)?;
            let telemetry_interval_sec: u16 = row.get(15)?;
            let auto_reconnect: i64 = row.get(16)?;
            let reconnect_interval_sec: u16 = row.get(17)?;

            Ok(HostProfileSummaryDto {
                id: row.get(0)?,
                alias: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                group_name: row.get(5)?,
                tags,
                auth_method: row.get(7)?,
                ssh_key_id: row.get(8)?,
                ssh_key_name: row.get(9)?,
                private_key_path: row.get(10)?,
                password_mode: row.get(11)?,
                has_saved_password: secret_ref_id.is_some(),
                active_port_forwards_count: active_pf_count as usize,
                telemetry_enabled: telemetry_enabled != 0,
                telemetry_interval_sec,
                auto_reconnect: auto_reconnect != 0,
                reconnect_interval_sec,
                last_connected_at: row.get(18)?,
                created_at: row.get(19)?,
                updated_at: row.get(20)?,
            })
        })?;

        let group_f = group_filter
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let tag_f = tag_filter
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());
        let query_f = search_query
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());

        let mut list = Vec::new();
        for item in rows {
            let dto = item?;
            if let Some(ref gf) = group_f {
                if !dto.group_name.eq_ignore_ascii_case(gf) {
                    continue;
                }
            }
            if let Some(ref tf) = tag_f {
                if !dto.tags.iter().any(|t| t.to_lowercase() == *tf) {
                    continue;
                }
            }
            if let Some(ref q) = query_f {
                let matches = dto.alias.to_lowercase().contains(q)
                    || dto.host.to_lowercase().contains(q)
                    || dto.username.to_lowercase().contains(q)
                    || dto.group_name.to_lowercase().contains(q);
                if !matches {
                    continue;
                }
            }
            list.push(dto);
        }

        Ok(list)
    }

    pub fn host_get_detail(&self, host_id: &str) -> AppResult<HostFullConfigDto> {
        let conn = self.lock_conn()?;
        Self::get_host_detail_internal(&conn, host_id)
    }

    fn get_host_detail_internal(conn: &Connection, host_id: &str) -> AppResult<HostFullConfigDto> {
        let mut stmt = conn.prepare(
            r#"
            SELECT
                v.id,
                v.alias,
                v.host,
                v.port,
                v.username,
                v.group_name,
                v.tags_json,
                v.auth_method,
                v.ssh_key_id,
                COALESCE(k.private_key_path, v.private_key_path) AS private_key_path,
                v.password_mode,
                v.secret_ref_id,
                v.last_connected_at,
                v.created_at,
                v.updated_at
            FROM host_profiles v
            LEFT JOIN ssh_keys k ON v.ssh_key_id = k.id
            WHERE v.id = ?1
            "#,
        )?;

        let profile_row = stmt
            .query_row(params![host_id], |row| {
                let tags_json: String = row.get(6)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
                let secret_ref_id: Option<String> = row.get(11)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u16>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    tags,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, String>(10)?,
                    secret_ref_id.is_some(),
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, String>(14)?,
                ))
            })
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Host profile not found: {host_id}")))?;

        let options = Self::get_ssh_options_internal(conn, host_id)?;
        let port_forwards = Self::get_port_forwards_internal(conn, host_id)?;

        Ok(HostFullConfigDto {
            id: profile_row.0,
            alias: profile_row.1,
            host: profile_row.2,
            port: profile_row.3,
            username: profile_row.4,
            group_name: profile_row.5,
            tags: profile_row.6,
            auth_method: profile_row.7,
            ssh_key_id: profile_row.8,
            private_key_path: profile_row.9,
            password_mode: profile_row.10,
            has_saved_password: profile_row.11,
            last_connected_at: profile_row.12,
            created_at: profile_row.13,
            updated_at: profile_row.14,
            options,
            port_forwards,
        })
    }

    fn get_ssh_options_internal(conn: &Connection, host_id: &str) -> AppResult<SshOptionsDto> {
        let opt = conn
            .query_row(
                r#"
                SELECT host_id, server_alive_interval, server_alive_count_max,
                       compression, strict_host_key_checking, startup_command,
                       forward_agent, COALESCE(telemetry_enabled, 0), COALESCE(telemetry_interval_sec, 2),
                       COALESCE(auto_reconnect, 0), COALESCE(reconnect_interval_sec, 2)
                FROM ssh_options
                WHERE host_id = ?1
                "#,
                params![host_id],
                |row| {
                    let compression: i64 = row.get(3)?;
                    let forward_agent: i64 = row.get(6)?;
                    let telemetry_enabled: i64 = row.get(7)?;
                    let auto_reconnect: i64 = row.get(9)?;
                    Ok(SshOptionsDto {
                        host_id: row.get(0)?,
                        server_alive_interval: row.get(1)?,
                        server_alive_count_max: row.get(2)?,
                        compression: compression != 0,
                        strict_host_key_checking: row.get(4)?,
                        startup_command: row.get(5)?,
                        forward_agent: forward_agent != 0,
                        telemetry_enabled: telemetry_enabled != 0,
                        telemetry_interval_sec: row.get(8)?,
                        auto_reconnect: auto_reconnect != 0,
                        reconnect_interval_sec: row.get(10)?,
                    })
                },
            )
            .optional()?;

        Ok(opt.unwrap_or(SshOptionsDto {
            host_id: host_id.to_string(),
            server_alive_interval: 60,
            server_alive_count_max: 3,
            compression: false,
            strict_host_key_checking: "ACCEPT_NEW".to_string(),
            startup_command: None,
            forward_agent: false,
            telemetry_enabled: false,
            telemetry_interval_sec: 2,
            auto_reconnect: false,
            reconnect_interval_sec: 2,
        }))
    }

    fn get_port_forwards_internal(
        conn: &Connection,
        host_id: &str,
    ) -> AppResult<Vec<PortForwardRuleDto>> {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, host_id, label, forward_type, bind_address,
                   bind_port, target_host, target_port, is_enabled
            FROM port_forwards
            WHERE host_id = ?1
            ORDER BY created_at ASC
            "#,
        )?;

        let rows = stmt.query_map(params![host_id], |row| {
            let is_enabled: i64 = row.get(8)?;
            Ok(PortForwardRuleDto {
                id: row.get(0)?,
                host_id: row.get(1)?,
                label: row.get(2)?,
                forward_type: row.get(3)?,
                bind_address: row.get(4)?,
                bind_port: row.get(5)?,
                target_host: row.get(6)?,
                target_port: row.get(7)?,
                is_enabled: is_enabled != 0,
            })
        })?;

        let mut rules = Vec::new();
        for r in rows {
            rules.push(r?);
        }
        Ok(rules)
    }

    fn validate_host_fields(
        alias: &str,
        host: &str,
        port: u16,
        username: &str,
        auth_method: &str,
    ) -> AppResult<()> {
        if alias.trim().is_empty() {
            return Err(AppError::Validation("Alias cannot be empty".to_string()));
        }
        if host.trim().is_empty() {
            return Err(AppError::Validation("Host/IP cannot be empty".to_string()));
        }
        if port == 0 {
            return Err(AppError::Validation(
                "Port must be between 1 and 65535".to_string(),
            ));
        }
        if username.trim().is_empty() {
            return Err(AppError::Validation("Username cannot be empty".to_string()));
        }
        if auth_method != "SSH_KEY" && auth_method != "PASSWORD" {
            return Err(AppError::Validation(format!(
                "Invalid auth_method '{auth_method}'"
            )));
        }
        Ok(())
    }

    pub fn host_create(&self, req: CreateHostRequestDto) -> AppResult<HostFullConfigDto> {
        Self::validate_host_fields(
            &req.alias,
            &req.host,
            req.port,
            &req.username,
            &req.auth_method,
        )?;

        let mut conn = self.lock_conn()?;

        let (resolved_key_id, resolved_private_key_path) = Self::resolve_host_key_binding(
            &conn,
            &req.auth_method,
            req.ssh_key_id.as_deref(),
            req.private_key_path.as_deref(),
        )?;

        let host_id = Uuid::new_v4().to_string();
        let (password_mode, secret_ref_id) = match req.auth_method.as_str() {
            "PASSWORD" => {
                let mode = req
                    .password_mode
                    .as_deref()
                    .unwrap_or("PROMPT_EVERY_TIME");
                if mode == "SAVED" {
                    if let Some(pw) = req.password.as_deref().filter(|p| !p.is_empty()) {
                        let ref_id = SecretVault::host_password_ref(&host_id);
                        self.secret_vault.store_secret(&ref_id, pw)?;
                        ("SAVED".to_string(), Some(ref_id))
                    } else {
                        ("PROMPT_EVERY_TIME".to_string(), None)
                    }
                } else {
                    ("PROMPT_EVERY_TIME".to_string(), None)
                }
            }
            _ => ("NONE".to_string(), None),
        };

        let tags_json = serde_json::to_string(&req.tags).unwrap_or_else(|_| "[]".to_string());

        let tx = conn.transaction()?;
        let group_name = Self::resolve_canonical_group_name(&tx, &req.group_name)?;
        tx.execute(
            r#"
            INSERT INTO host_profiles (
                id, alias, host, port, username, group_name,
                tags_json, auth_method, ssh_key_id, private_key_path, password_mode, secret_ref_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                host_id,
                req.alias.trim(),
                req.host.trim(),
                req.port,
                req.username.trim(),
                group_name,
                tags_json,
                req.auth_method,
                resolved_key_id,
                resolved_private_key_path,
                password_mode,
                secret_ref_id,
            ],
        )?;

        let opts = req.options.unwrap_or_default();
        Self::insert_default_or_custom_options(&tx, &host_id, &opts)?;
        tx.commit()?;

        Self::get_host_detail_internal(&conn, &host_id)
    }

    fn insert_default_or_custom_options(
        conn: &Connection,
        host_id: &str,
        opts: &UpdateSshOptionsFieldsDto,
    ) -> AppResult<()> {
        let server_alive_interval = opts.server_alive_interval.unwrap_or(60);
        let server_alive_count_max = opts.server_alive_count_max.unwrap_or(3);
        let compression = if opts.compression.unwrap_or(false) { 1 } else { 0 };
        let strict_host_key_checking = opts
            .strict_host_key_checking
            .as_deref()
            .unwrap_or("ACCEPT_NEW");
        let startup_command = opts
            .startup_command
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let forward_agent = if opts.forward_agent.unwrap_or(false) { 1 } else { 0 };
        let telemetry_enabled = if opts.telemetry_enabled.unwrap_or(false) { 1 } else { 0 };
        let telemetry_interval_sec = opts.telemetry_interval_sec.unwrap_or(2).clamp(1, 60);
        let auto_reconnect = if opts.auto_reconnect.unwrap_or(false) { 1 } else { 0 };
        let reconnect_interval_sec = opts.reconnect_interval_sec.unwrap_or(2).clamp(1, 60);

        conn.execute(
            r#"
            INSERT INTO ssh_options (
                host_id, server_alive_interval, server_alive_count_max,
                compression, strict_host_key_checking, startup_command,
                forward_agent, telemetry_enabled, telemetry_interval_sec,
                auto_reconnect, reconnect_interval_sec
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                host_id,
                server_alive_interval,
                server_alive_count_max,
                compression,
                strict_host_key_checking,
                startup_command,
                forward_agent,
                telemetry_enabled,
                telemetry_interval_sec,
                auto_reconnect,
                reconnect_interval_sec,
            ],
        )?;
        Ok(())
    }

    pub fn host_update(&self, req: UpdateHostRequestDto) -> AppResult<HostFullConfigDto> {
        Self::validate_host_fields(
            &req.alias,
            &req.host,
            req.port,
            &req.username,
            &req.auth_method,
        )?;

        let mut conn = self.lock_conn()?;
        let existing_secret_ref: Option<Option<String>> = conn
            .query_row(
                "SELECT secret_ref_id FROM host_profiles WHERE id = ?1",
                params![req.id],
                |r| r.get(0),
            )
            .optional()?;

        let Some(old_secret_ref) = existing_secret_ref else {
            return Err(AppError::NotFound(format!(
                "Host profile not found: {}",
                req.id
            )));
        };

        let (resolved_key_id, resolved_private_key_path) = Self::resolve_host_key_binding(
            &conn,
            &req.auth_method,
            req.ssh_key_id.as_deref(),
            req.private_key_path.as_deref(),
        )?;

        let (password_mode, new_secret_ref) = match req.auth_method.as_str() {
            "PASSWORD" => {
                let mode = req
                    .password_mode
                    .as_deref()
                    .unwrap_or("PROMPT_EVERY_TIME");
                if mode == "SAVED" {
                    if let Some(pw) = req.password.as_deref().filter(|p| !p.is_empty()) {
                        let ref_id = SecretVault::host_password_ref(&req.id);
                        self.secret_vault.store_secret(&ref_id, pw)?;
                        ("SAVED".to_string(), Some(ref_id))
                    } else if old_secret_ref.is_some() {
                        ("SAVED".to_string(), old_secret_ref)
                    } else {
                        ("PROMPT_EVERY_TIME".to_string(), None)
                    }
                } else {
                    if let Some(ref old_ref) = old_secret_ref {
                        let _ = self.secret_vault.delete_secret(old_ref);
                    }
                    ("PROMPT_EVERY_TIME".to_string(), None)
                }
            }
            _ => {
                if let Some(ref old_ref) = old_secret_ref {
                    let _ = self.secret_vault.delete_secret(old_ref);
                }
                ("NONE".to_string(), None)
            }
        };

        let tags_json = serde_json::to_string(&req.tags).unwrap_or_else(|_| "[]".to_string());

        let tx = conn.transaction()?;
        let group_name = Self::resolve_canonical_group_name(&tx, &req.group_name)?;
        tx.execute(
            r#"
            UPDATE host_profiles
            SET alias = ?2,
                host = ?3,
                port = ?4,
                username = ?5,
                group_name = ?6,
                tags_json = ?7,
                auth_method = ?8,
                ssh_key_id = ?9,
                private_key_path = ?10,
                password_mode = ?11,
                secret_ref_id = ?12,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = ?1
            "#,
            params![
                req.id,
                req.alias.trim(),
                req.host.trim(),
                req.port,
                req.username.trim(),
                group_name,
                tags_json,
                req.auth_method,
                resolved_key_id,
                resolved_private_key_path,
                password_mode,
                new_secret_ref,
            ],
        )?;

        if let Some(opts) = req.options {
            let current = Self::get_ssh_options_internal(&tx, &req.id)?;
            let server_alive_interval = opts
                .server_alive_interval
                .unwrap_or(current.server_alive_interval);
            let server_alive_count_max = opts
                .server_alive_count_max
                .unwrap_or(current.server_alive_count_max);
            let compression = if opts.compression.unwrap_or(current.compression) {
                1
            } else {
                0
            };
            let strict_host_key_checking = opts
                .strict_host_key_checking
                .unwrap_or(current.strict_host_key_checking);
            let startup_command = match opts.startup_command {
                Some(s) => {
                    let trimmed = s.trim().to_string();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed)
                    }
                }
                None => current.startup_command,
            };
            let forward_agent = if opts.forward_agent.unwrap_or(current.forward_agent) {
                1
            } else {
                0
            };
            let telemetry_enabled = if opts.telemetry_enabled.unwrap_or(current.telemetry_enabled) {
                1
            } else {
                0
            };
            let telemetry_interval_sec = opts
                .telemetry_interval_sec
                .unwrap_or(current.telemetry_interval_sec)
                .clamp(1, 60);
            let auto_reconnect = if opts.auto_reconnect.unwrap_or(current.auto_reconnect) {
                1
            } else {
                0
            };
            let reconnect_interval_sec = opts
                .reconnect_interval_sec
                .unwrap_or(current.reconnect_interval_sec)
                .clamp(1, 60);

            tx.execute(
                r#"
                UPDATE ssh_options
                SET server_alive_interval = ?2,
                    server_alive_count_max = ?3,
                    compression = ?4,
                    strict_host_key_checking = ?5,
                    startup_command = ?6,
                    forward_agent = ?7,
                    telemetry_enabled = ?8,
                    telemetry_interval_sec = ?9,
                    auto_reconnect = ?10,
                    reconnect_interval_sec = ?11,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                WHERE host_id = ?1
                "#,
                params![
                    req.id,
                    server_alive_interval,
                    server_alive_count_max,
                    compression,
                    strict_host_key_checking,
                    startup_command,
                    forward_agent,
                    telemetry_enabled,
                    telemetry_interval_sec,
                    auto_reconnect,
                    reconnect_interval_sec,
                ],
            )?;
        }

        tx.commit()?;
        Self::get_host_detail_internal(&conn, &req.id)
    }

    pub fn host_delete(&self, host_id: &str) -> AppResult<DeleteResultDto> {
        let conn = self.lock_conn()?;
        let secret_ref: Option<Option<String>> = conn
            .query_row(
                "SELECT secret_ref_id FROM host_profiles WHERE id = ?1",
                params![host_id],
                |r| r.get(0),
            )
            .optional()?;

        let affected = conn.execute("DELETE FROM host_profiles WHERE id = ?1", params![host_id])?;
        if let Some(Some(ref_id)) = secret_ref {
            let _ = self.secret_vault.delete_secret(&ref_id);
        }

        Ok(DeleteResultDto {
            deleted: affected > 0,
        })
    }

    pub fn host_duplicate(
        &self,
        host_id: &str,
        new_alias: &str,
        new_host: &str,
    ) -> AppResult<HostFullConfigDto> {
        let mut conn = self.lock_conn()?;
        let source = Self::get_host_detail_internal(&conn, host_id)?;

        let final_alias = if new_alias.trim().is_empty() {
            format!("{} (Copy)", source.alias)
        } else {
            new_alias.trim().to_string()
        };
        let final_host = if new_host.trim().is_empty() {
            source.host.clone()
        } else {
            new_host.trim().to_string()
        };

        let new_id = Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&source.tags).unwrap_or_else(|_| "[]".to_string());
        let duplicate_private_key_path =
            if source.auth_method == "SSH_KEY" && source.ssh_key_id.is_none() {
                source.private_key_path.clone()
            } else {
                None
            };

        let tx = conn.transaction()?;
        tx.execute(
            r#"
            INSERT INTO host_profiles (
                id, alias, host, port, username, group_name,
                tags_json, auth_method, ssh_key_id, private_key_path, password_mode, secret_ref_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)
            "#,
            params![
                new_id,
                final_alias,
                final_host,
                source.port,
                source.username,
                source.group_name,
                tags_json,
                source.auth_method,
                source.ssh_key_id,
                duplicate_private_key_path,
                if source.auth_method == "PASSWORD" {
                    "PROMPT_EVERY_TIME"
                } else {
                    "NONE"
                }
            ],
        )?;

        tx.execute(
            r#"
            INSERT INTO ssh_options (
                host_id, server_alive_interval, server_alive_count_max,
                compression, strict_host_key_checking, startup_command,
                forward_agent, telemetry_enabled, telemetry_interval_sec,
                auto_reconnect, reconnect_interval_sec
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                new_id,
                source.options.server_alive_interval,
                source.options.server_alive_count_max,
                if source.options.compression { 1 } else { 0 },
                source.options.strict_host_key_checking,
                source.options.startup_command,
                if source.options.forward_agent { 1 } else { 0 },
                if source.options.telemetry_enabled { 1 } else { 0 },
                source.options.telemetry_interval_sec,
                if source.options.auto_reconnect { 1 } else { 0 },
                source.options.reconnect_interval_sec,
            ],
        )?;

        for pf in &source.port_forwards {
            let pf_id = Uuid::new_v4().to_string();
            tx.execute(
                r#"
                INSERT INTO port_forwards (
                    id, host_id, label, forward_type, bind_address,
                    bind_port, target_host, target_port, is_enabled
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                "#,
                params![
                    pf_id,
                    new_id,
                    pf.label,
                    pf.forward_type,
                    pf.bind_address,
                    pf.bind_port,
                    pf.target_host,
                    pf.target_port,
                    if pf.is_enabled { 1 } else { 0 },
                ],
            )?;
        }

        tx.commit()?;
        Self::get_host_detail_internal(&conn, &new_id)
    }

    pub fn host_touch_last_connected(&self, host_id: &str) -> AppResult<()> {
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE host_profiles SET last_connected_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            params![host_id],
        )?;
        Ok(())
    }

    pub fn port_forward_list(&self, host_id: &str) -> AppResult<Vec<PortForwardRuleDto>> {
        let conn = self.lock_conn()?;
        Self::get_port_forwards_internal(&conn, host_id)
    }

    pub fn port_forward_upsert(
        &self,
        req: UpsertPortForwardRequestDto,
    ) -> AppResult<PortForwardRuleDto> {
        let conn = self.lock_conn()?;
        let rule_id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let (target_host, target_port) = if req.forward_type == "DYNAMIC" {
            (None, None)
        } else {
            (req.target_host, req.target_port)
        };

        conn.execute(
            r#"
            INSERT INTO port_forwards (
                id, host_id, label, forward_type, bind_address,
                bind_port, target_host, target_port, is_enabled
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                forward_type = excluded.forward_type,
                bind_address = excluded.bind_address,
                bind_port = excluded.bind_port,
                target_host = excluded.target_host,
                target_port = excluded.target_port,
                is_enabled = excluded.is_enabled
            "#,
            params![
                rule_id,
                req.host_id,
                req.label,
                req.forward_type,
                req.bind_address,
                req.bind_port,
                target_host,
                target_port,
                if req.is_enabled { 1 } else { 0 },
            ],
        )?;

        Ok(PortForwardRuleDto {
            id: rule_id,
            host_id: req.host_id,
            label: req.label,
            forward_type: req.forward_type,
            bind_address: req.bind_address,
            bind_port: req.bind_port,
            target_host,
            target_port,
            is_enabled: req.is_enabled,
        })
    }

    pub fn port_forward_toggle(
        &self,
        rule_id: &str,
        is_enabled: bool,
    ) -> AppResult<PortForwardToggleResultDto> {
        let conn = self.lock_conn()?;
        let affected = conn.execute(
            "UPDATE port_forwards SET is_enabled = ?2 WHERE id = ?1",
            params![rule_id, if is_enabled { 1 } else { 0 }],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(format!(
                "Port forward rule not found: {rule_id}"
            )));
        }
        Ok(PortForwardToggleResultDto {
            rule_id: rule_id.to_string(),
            is_enabled,
        })
    }

    pub fn port_forward_delete(&self, rule_id: &str) -> AppResult<DeleteResultDto> {
        let conn = self.lock_conn()?;
        let affected =
            conn.execute("DELETE FROM port_forwards WHERE id = ?1", params![rule_id])?;
        Ok(DeleteResultDto {
            deleted: affected > 0,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_sqlite_schema_init_and_pragmas() {
        let dir = tempdir().expect("create temp dir");
        let db = Database::init(dir.path()).expect("init database");

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
            "app_settings",
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
    }

    #[test]
    fn test_ed25519_key_generation_and_single_default_key_constraint() {
        let dir = tempdir().expect("create temp dir");
        let db = Database::init_in_memory(dir.path()).expect("init in-memory db");

        let key1 = db
            .key_generate(GenerateSshKeyRequestDto {
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

        let stored_pw = db
            .get_key_secret(&key1.id)
            .expect("read key secret")
            .expect("secret exists");
        assert_eq!(stored_pw.as_str(), "s3cr3t-passphrase");

        let key2 = db
            .key_generate(GenerateSshKeyRequestDto {
                name: "Secondary Ed25519".to_string(),
                key_type: "ED25519".to_string(),
                comment: None,
                passphrase: None,
                set_default: true,
            })
            .expect("generate second ed25519 key as default");

        assert!(key2.is_default);

        let default_key = db
            .key_get_default()
            .expect("query default key")
            .expect("default exists");
        assert_eq!(default_key.id, key2.id);

        let all_keys = db.key_list().expect("list keys");
        let default_count = all_keys.iter().filter(|k| k.is_default).count();
        assert_eq!(default_count, 1);

        db.key_set_default(Some(key1.id.clone()))
            .expect("switch default back to key1");
        let switched_default = db.key_get_default().unwrap().unwrap();
        assert_eq!(switched_default.id, key1.id);
    }

    #[test]
    fn test_host_profiles_crud_and_cascade() {
        let dir = tempdir().expect("create temp dir");
        let db = Database::init_in_memory(dir.path()).expect("init in-memory db");

        let created_pw = db
            .host_create(CreateHostRequestDto {
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
            })
            .expect("create PASSWORD host");

        assert_eq!(created_pw.alias, "Prod API Server");
        assert_eq!(created_pw.password_mode, "SAVED");
        assert!(created_pw.has_saved_password);

        let saved_pw = db
            .get_host_secret(&created_pw.id)
            .expect("get host secret")
            .expect("host secret exists");
        assert_eq!(saved_pw.as_str(), "my-server-pw");

        let dummy_key_path = dir.path().join("id_ed25519_test");
        std::fs::write(&dummy_key_path, "DUMMY PRIVATE KEY CONTENT").unwrap();

        let created_key = db
            .host_create(CreateHostRequestDto {
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
            })
            .expect("create SSH_KEY host");

        assert_eq!(created_key.auth_method, "SSH_KEY");
        assert!(created_key.ssh_key_id.is_none());
        assert_eq!(
            created_key.private_key_path.as_deref(),
            Some(dummy_key_path.to_string_lossy().as_ref())
        );
        assert!(
            db.key_list().expect("list keys").is_empty(),
            "private '--' key must not be auto-saved into Vault"
        );

        let all_hosts = db.host_list(None, None, None).expect("list all hosts");
        assert_eq!(all_hosts.len(), 2);

        let updated = db
            .host_update(UpdateHostRequestDto {
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
            })
            .expect("update host");

        assert_eq!(updated.alias, "Prod API Server v2");
        assert!(!updated.has_saved_password);

        let duplicated = db
            .host_duplicate(&created_pw.id, "Prod API Replica", "192.168.1.102")
            .expect("duplicate host");
        assert_ne!(duplicated.id, created_pw.id);

        let del_res = db.host_delete(&created_pw.id).expect("delete host");
        assert!(del_res.deleted);
        assert!(db.host_get_detail(&created_pw.id).is_err());
    }

    #[test]
    fn test_vault_key_name_limits_and_duplicate_import_checks() {
        let dir = tempdir().expect("create temp dir");
        let db = Database::init(dir.path()).expect("init database");

        let too_long = "k".repeat(MAX_KEY_NAME_LEN + 1);
        assert!(db
            .key_generate(GenerateSshKeyRequestDto {
                name: too_long.clone(),
                key_type: "ED25519".to_string(),
                comment: None,
                passphrase: None,
                set_default: false,
            })
            .is_err());

        let generated = db
            .key_generate(GenerateSshKeyRequestDto {
                name: "Primary Key".to_string(),
                key_type: "ED25519".to_string(),
                comment: None,
                passphrase: None,
                set_default: true,
            })
            .expect("generate primary key");

        // Duplicate key name (case-insensitive) must be rejected on generate & import.
        let dup_gen = db.key_generate(GenerateSshKeyRequestDto {
            name: "  primary key ".to_string(),
            key_type: "ED25519".to_string(),
            comment: None,
            passphrase: None,
            set_default: false,
        });
        assert!(dup_gen.is_err());

        // Delete from Vault without deleting file on disk, then re-import the existing file.
        db.key_delete(&generated.id, false)
            .expect("delete metadata only");
        assert!(Path::new(&generated.private_key_path).exists());

        assert!(db
            .key_import(ImportSshKeyRequestDto {
                name: too_long,
                source_path: generated.private_key_path.clone(),
                copy_to_managed_dir: false,
                passphrase: None,
                set_default: false,
            })
            .is_err());

        let reimported = db
            .key_import(ImportSshKeyRequestDto {
                name: "Reimported Key".to_string(),
                source_path: generated.private_key_path.clone(),
                copy_to_managed_dir: false,
                passphrase: None,
                set_default: true,
            })
            .expect("re-import existing file once");

        // Importing the same key again (same path OR copied path with same fingerprint) must error cleanly.
        let dup_same_path = db.key_import(ImportSshKeyRequestDto {
            name: "Another Name".to_string(),
            source_path: reimported.private_key_path.clone(),
            copy_to_managed_dir: false,
            passphrase: None,
            set_default: false,
        });
        assert!(dup_same_path.is_err());

        let copied_elsewhere = dir.path().join("external_copy_key");
        fs::copy(&reimported.private_key_path, &copied_elsewhere).expect("copy key externally");
        let dup_same_fp = db.key_import(ImportSshKeyRequestDto {
            name: "Duplicate Fingerprint".to_string(),
            source_path: copied_elsewhere.to_string_lossy().to_string(),
            copy_to_managed_dir: true,
            passphrase: None,
            set_default: false,
        });
        assert!(dup_same_fp.is_err());

        // Verify Vault still only has 1 key and no orphan `.imported_key` file was left behind.
        assert_eq!(db.key_list().unwrap().len(), 1);
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
        let db = Database::init(dir.path()).expect("init database");

        let private_a = dir.path().join("private_host_a");
        let private_b = dir.path().join("private_host_b");
        fs::write(&private_a, "PRIVATE KEY A").unwrap();
        fs::write(&private_b, "PRIVATE KEY B").unwrap();
        let private_a_str = private_a.to_string_lossy().to_string();
        let private_b_str = private_b.to_string_lossy().to_string();

        // 1. Create host with '--' (`ssh_key_id: None`) and quoted private key path
        let created = db
            .host_create(CreateHostRequestDto {
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
            })
            .expect("create host with private '--' key");

        assert!(created.ssh_key_id.is_none());
        assert_eq!(created.private_key_path.as_deref(), Some(private_a_str.as_str()));
        assert!(db.key_list().unwrap().is_empty());

        let summary_list = db.host_list(None, None, None).expect("list host");
        assert_eq!(summary_list.len(), 1);
        assert!(summary_list[0].ssh_key_id.is_none());
        assert!(summary_list[0].ssh_key_name.is_none());
        assert_eq!(
            summary_list[0].private_key_path.as_deref(),
            Some(private_a_str.as_str())
        );

        // 2. Duplicate preserves private key path without writing to Vault
        let duplicated = db
            .host_duplicate(&created.id, "Private Node Copy", "10.10.0.6")
            .expect("duplicate private-key host");
        assert!(duplicated.ssh_key_id.is_none());
        assert_eq!(
            duplicated.private_key_path.as_deref(),
            Some(private_a_str.as_str())
        );
        assert!(db.key_list().unwrap().is_empty());

        // 3. Switch host to a shared Vault key -> links ssh_key_id and clears private path column
        let vault_key = db
            .key_generate(GenerateSshKeyRequestDto {
                name: "Shared Vault Key".to_string(),
                key_type: "ED25519".to_string(),
                comment: None,
                passphrase: None,
                set_default: false,
            })
            .expect("generate Vault key");

        let linked = db
            .host_update(UpdateHostRequestDto {
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
            })
            .expect("bind Vault key");
        assert_eq!(linked.ssh_key_id.as_deref(), Some(vault_key.id.as_str()));
        assert_eq!(
            linked.private_key_path.as_deref(),
            Some(vault_key.private_key_path.as_str())
        );

        // 4. Switch back to '--' with another custom path -> still only 1 Vault key
        let relinked_private = db
            .host_update(UpdateHostRequestDto {
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
            })
            .expect("switch back to '--' private key");
        assert!(relinked_private.ssh_key_id.is_none());
        assert_eq!(
            relinked_private.private_key_path.as_deref(),
            Some(private_b_str.as_str())
        );
        assert_eq!(db.key_list().unwrap().len(), 1);

        // 5. Switch to PASSWORD -> clears both ssh_key_id and private_key_path
        let pw_mode = db
            .host_update(UpdateHostRequestDto {
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
            })
            .expect("switch to PASSWORD");
        assert!(pw_mode.ssh_key_id.is_none());
        assert!(pw_mode.private_key_path.is_none());
    }

    #[test]
    fn group_crud_and_move_profile_work_reliably() {
        let temp = tempdir().unwrap();
        let db = Database::init_in_memory(temp.path()).unwrap();

        // 1. Create a host directly inside group "Workstations" -> group_list includes "Workstations"
        let created = db
            .host_create(CreateHostRequestDto {
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
            })
            .expect("create host in custom group");

        assert_eq!(created.group_name, "Workstations");
        assert!(db.host_group_list().unwrap().contains(&"Workstations".to_string()));

        // 2. Group creation rejects empty, >64 chars, control chars, and case-insensitive duplicates
        assert!(db.host_group_create("   ").is_err());
        assert!(db.host_group_create(&"g".repeat(65)).is_err());
        assert!(db.host_group_create("bad\nname").is_err());
        assert!(db.host_group_create("workstations").is_err());

        let singapore = db.host_group_create("  Singapore  ").expect("create empty group");
        assert_eq!(singapore, "Singapore");
        assert_eq!(db.host_group_list().unwrap(), vec!["Singapore", "Workstations"]);

        // 3. Move connection from "Workstations" to "Singapore" -> updates group while keeping "Workstations" listed
        let moved = db
            .host_move_group(&created.id, "singapore")
            .expect("move connection into Singapore");
        assert_eq!(moved, "Singapore");
        assert_eq!(db.host_get_detail(&created.id).unwrap().group_name, "Singapore");
        assert!(db.host_group_list().unwrap().contains(&"Workstations".to_string()));

        // 4. Deleting "Default" is blocked; deleting "Singapore" safely moves connections to "Default"
        assert!(db.host_group_delete("Default").is_err());
        let deleted = db.host_group_delete("Singapore").expect("delete Singapore group");
        assert!(deleted.deleted);
        assert_eq!(db.host_get_detail(&created.id).unwrap().group_name, "Default");
        assert!(!db.host_group_list().unwrap().contains(&"Singapore".to_string()));
    }
}
