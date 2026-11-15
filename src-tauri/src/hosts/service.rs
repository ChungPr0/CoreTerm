use std::path::Path;

use uuid::Uuid;
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::host_repo::HostRowWrite;
use crate::infra::db::{group_repo, host_repo, key_repo, port_forward_repo, SqliteDb};
use crate::infra::os::restrict_private_key_acl;
use crate::infra::security::SecretVault;
use crate::ipc::dto::{
    CreateHostRequestDto, DeleteResultDto, HostFullConfigDto, HostProfileSummaryDto,
    PortForwardRuleDto, PortForwardToggleResultDto, SavePortForwardDto, UpdateHostRequestDto,
    UpsertPortForwardRequestDto,
};
use crate::keys::normalize_key_path_input;

#[derive(Clone)]
pub struct HostService {
    db: SqliteDb,
    vault: SecretVault,
}

impl HostService {
    pub fn new(db: SqliteDb, vault: SecretVault) -> Self {
        Self { db, vault }
    }

    pub fn list(
        &self,
        group_filter: Option<String>,
        tag_filter: Option<String>,
        search_query: Option<String>,
    ) -> CoreResult<Vec<HostProfileSummaryDto>> {
        let conn = self.db.lock_conn()?;
        host_repo::list(&conn, group_filter, tag_filter, search_query)
    }

    pub fn get_detail(&self, host_id: &str) -> CoreResult<HostFullConfigDto> {
        let conn = self.db.lock_conn()?;
        host_repo::get_detail(&conn, host_id)
    }

    pub fn create(&self, req: CreateHostRequestDto) -> CoreResult<HostFullConfigDto> {
        Self::validate_host_fields(&req.alias, &req.host, req.port, &req.username, &req.auth_method)?;
        if let Some(ref rules) = req.port_forwards {
            Self::validate_port_forwards(rules)?;
        }

        let mut conn = self.db.lock_conn()?;
        let (resolved_key_id, resolved_key_path) = Self::resolve_host_key_binding(
            &conn,
            &req.auth_method,
            req.ssh_key_id.as_deref(),
            req.private_key_path.as_deref(),
        )?;

        let host_id = Uuid::new_v4().to_string();
        let (password_mode, secret_ref_id) = self.resolve_password_binding(
            &host_id,
            &req.auth_method,
            req.password_mode.as_deref(),
            req.password.as_deref(),
            None,
        )?;

        let tags_json = serde_json::to_string(&req.tags).unwrap_or_else(|_| "[]".to_string());
        let tx = conn.transaction()?;
        let group_name = group_repo::resolve_canonical(&tx, &req.group_name)?;
        let row = HostRowWrite {
            id: &host_id,
            alias: req.alias.trim(),
            host: req.host.trim(),
            port: req.port,
            username: req.username.trim(),
            group_name: &group_name,
            tags_json: &tags_json,
            auth_method: &req.auth_method,
            ssh_key_id: resolved_key_id.as_deref(),
            private_key_path: resolved_key_path.as_deref(),
            password_mode: &password_mode,
            secret_ref_id: secret_ref_id.as_deref(),
        };
        host_repo::insert_profile(&tx, &row)?;
        let opts = req.options.unwrap_or_default();
        host_repo::insert_options(&tx, &host_id, &opts)?;
        if let Some(ref rules) = req.port_forwards {
            port_forward_repo::replace_for_host(&tx, &host_id, rules)?;
        }
        if let Err(err) = tx.commit() {
            if let Some(ref ref_id) = secret_ref_id {
                let _ = self.vault.delete_secret(ref_id);
            }
            return Err(err.into());
        }

        host_repo::get_detail(&conn, &host_id)
    }

    pub fn update(&self, req: UpdateHostRequestDto) -> CoreResult<HostFullConfigDto> {
        Self::validate_host_fields(&req.alias, &req.host, req.port, &req.username, &req.auth_method)?;
        if let Some(ref rules) = req.port_forwards {
            Self::validate_port_forwards(rules)?;
        }

        let mut conn = self.db.lock_conn()?;
        let old_secret_ref = host_repo::find_secret_ref(&conn, &req.id)?
            .ok_or_else(|| CoreError::NotFound(format!("Host profile not found: {}", req.id)))?;

        let (resolved_key_id, resolved_key_path) = Self::resolve_host_key_binding(
            &conn,
            &req.auth_method,
            req.ssh_key_id.as_deref(),
            req.private_key_path.as_deref(),
        )?;

        let (password_mode, new_secret_ref) = self.resolve_password_binding(
            &req.id,
            &req.auth_method,
            req.password_mode.as_deref(),
            req.password.as_deref(),
            old_secret_ref,
        )?;

        let tags_json = serde_json::to_string(&req.tags).unwrap_or_else(|_| "[]".to_string());
        let tx = conn.transaction()?;
        let group_name = group_repo::resolve_canonical(&tx, &req.group_name)?;
        let row = HostRowWrite {
            id: &req.id,
            alias: req.alias.trim(),
            host: req.host.trim(),
            port: req.port,
            username: req.username.trim(),
            group_name: &group_name,
            tags_json: &tags_json,
            auth_method: &req.auth_method,
            ssh_key_id: resolved_key_id.as_deref(),
            private_key_path: resolved_key_path.as_deref(),
            password_mode: &password_mode,
            secret_ref_id: new_secret_ref.as_deref(),
        };
        host_repo::update_profile(&tx, &row)?;
        if let Some(opts) = req.options {
            host_repo::update_options(&tx, &req.id, opts)?;
        }
        if let Some(ref rules) = req.port_forwards {
            port_forward_repo::replace_for_host(&tx, &req.id, rules)?;
        }
        tx.commit()?;

        host_repo::get_detail(&conn, &req.id)
    }

    pub fn duplicate(
        &self,
        host_id: &str,
        new_alias: &str,
        new_host: &str,
    ) -> CoreResult<HostFullConfigDto> {
        let mut conn = self.db.lock_conn()?;
        let source = host_repo::get_detail(&conn, host_id)?;

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
        let duplicate_key_path = if source.auth_method == "SSH_KEY" && source.ssh_key_id.is_none() {
            source.private_key_path.clone()
        } else {
            None
        };
        let pw_mode = if source.auth_method == "PASSWORD" {
            "PROMPT_EVERY_TIME"
        } else {
            "NONE"
        };

        let tx = conn.transaction()?;
        let row = HostRowWrite {
            id: &new_id,
            alias: &final_alias,
            host: &final_host,
            port: source.port,
            username: &source.username,
            group_name: &source.group_name,
            tags_json: &tags_json,
            auth_method: &source.auth_method,
            ssh_key_id: source.ssh_key_id.as_deref(),
            private_key_path: duplicate_key_path.as_deref(),
            password_mode: pw_mode,
            secret_ref_id: None,
        };
        host_repo::insert_profile(&tx, &row)?;
        host_repo::insert_cloned_options(&tx, &new_id, &source.options)?;
        for pf in &source.port_forwards {
            port_forward_repo::upsert(
                &tx,
                UpsertPortForwardRequestDto {
                    id: None,
                    host_id: new_id.clone(),
                    label: pf.label.clone(),
                    forward_type: pf.forward_type.clone(),
                    bind_address: pf.bind_address.clone(),
                    bind_port: pf.bind_port,
                    target_host: pf.target_host.clone(),
                    target_port: pf.target_port,
                    is_enabled: pf.is_enabled,
                },
            )?;
        }
        tx.commit()?;

        host_repo::get_detail(&conn, &new_id)
    }

    pub fn delete(&self, host_id: &str) -> CoreResult<DeleteResultDto> {
        let conn = self.db.lock_conn()?;
        let secret_ref = host_repo::find_secret_ref(&conn, host_id)?;
        let affected = host_repo::delete(&conn, host_id)?;
        if let Some(Some(ref_id)) = secret_ref {
            let _ = self.vault.delete_secret(&ref_id);
        }
        Ok(DeleteResultDto {
            deleted: affected > 0,
        })
    }

    pub fn touch_last_connected(&self, host_id: &str) -> CoreResult<()> {
        let conn = self.db.lock_conn()?;
        host_repo::touch_last_connected(&conn, host_id)
    }

    pub fn list_groups(&self) -> CoreResult<Vec<String>> {
        let conn = self.db.lock_conn()?;
        group_repo::list(&conn)
    }

    pub fn create_group(&self, name: &str) -> CoreResult<String> {
        let conn = self.db.lock_conn()?;
        group_repo::create(&conn, name)
    }

    pub fn delete_group(&self, name: &str) -> CoreResult<DeleteResultDto> {
        let mut conn = self.db.lock_conn()?;
        group_repo::delete(&mut conn, name)
    }

    pub fn reorder_groups(&self, group_names: Vec<String>) -> CoreResult<Vec<String>> {
        let mut conn = self.db.lock_conn()?;
        group_repo::reorder(&mut conn, &group_names)
    }

    pub fn move_group(&self, host_id: &str, group_name: &str) -> CoreResult<String> {
        let mut conn = self.db.lock_conn()?;
        if !host_repo::exists(&conn, host_id)? {
            return Err(CoreError::NotFound(format!(
                "Host profile not found: {host_id}"
            )));
        }
        let tx = conn.transaction()?;
        let canonical = group_repo::resolve_canonical(&tx, group_name)?;
        host_repo::update_group(&tx, host_id, &canonical)?;
        tx.commit()?;
        Ok(canonical)
    }

    pub fn list_port_forwards(&self, host_id: &str) -> CoreResult<Vec<PortForwardRuleDto>> {
        let conn = self.db.lock_conn()?;
        port_forward_repo::list_by_host(&conn, host_id)
    }

    pub fn upsert_port_forward(
        &self,
        req: UpsertPortForwardRequestDto,
    ) -> CoreResult<PortForwardRuleDto> {
        let conn = self.db.lock_conn()?;
        port_forward_repo::upsert(&conn, req)
    }

    pub fn toggle_port_forward(
        &self,
        rule_id: &str,
        is_enabled: bool,
    ) -> CoreResult<PortForwardToggleResultDto> {
        let conn = self.db.lock_conn()?;
        port_forward_repo::toggle(&conn, rule_id, is_enabled)
    }

    pub fn delete_port_forward(&self, rule_id: &str) -> CoreResult<DeleteResultDto> {
        let conn = self.db.lock_conn()?;
        port_forward_repo::delete(&conn, rule_id)
    }

    pub fn get_secret(&self, host_id: &str) -> CoreResult<Option<Zeroizing<String>>> {
        let conn = self.db.lock_conn()?;
        if let Some(Some(ref_id)) = host_repo::find_secret_ref(&conn, host_id)? {
            return self.vault.get_secret(&ref_id);
        }
        Ok(None)
    }

    pub fn save_secret(&self, host_id: &str, secret: &str) -> CoreResult<()> {
        let ref_id = SecretVault::host_password_ref(host_id);
        self.vault.store_secret(&ref_id, secret)?;
        let conn = self.db.lock_conn()?;
        host_repo::set_saved_secret(&conn, host_id, &ref_id)
    }

    fn validate_host_fields(
        alias: &str,
        host: &str,
        port: u16,
        username: &str,
        auth_method: &str,
    ) -> CoreResult<()> {
        if alias.trim().is_empty() {
            return Err(CoreError::Validation("Alias cannot be empty".to_string()));
        }
        if host.trim().is_empty() {
            return Err(CoreError::Validation("Host/IP cannot be empty".to_string()));
        }
        if port == 0 {
            return Err(CoreError::Validation(
                "Port must be between 1 and 65535".to_string(),
            ));
        }
        if username.trim().is_empty() {
            return Err(CoreError::Validation("Username cannot be empty".to_string()));
        }
        if auth_method != "SSH_KEY" && auth_method != "PASSWORD" {
            return Err(CoreError::Validation(format!(
                "Invalid auth_method '{auth_method}'"
            )));
        }
        Ok(())
    }

    fn validate_port_forwards(rules: &[SavePortForwardDto]) -> CoreResult<()> {
        for rule in rules {
            if rule.bind_port == 0 {
                return Err(CoreError::Validation(
                    "Bind port must be between 1 and 65535".to_string(),
                ));
            }
            port_forward_repo::normalize_targets(
                &rule.forward_type,
                rule.target_host.clone(),
                rule.target_port,
            )?;
        }
        Ok(())
    }

    /// Resolves key binding without auto-importing raw paths into `ssh_keys`.
    fn resolve_host_key_binding(
        conn: &rusqlite::Connection,
        auth_method: &str,
        ssh_key_id: Option<&str>,
        private_key_path: Option<&str>,
    ) -> CoreResult<(Option<String>, Option<String>)> {
        if auth_method != "SSH_KEY" {
            return Ok((None, None));
        }

        if let Some(id) = ssh_key_id.map(str::trim).filter(|s| !s.is_empty()) {
            if !key_repo::exists(conn, id)? {
                return Err(CoreError::NotFound(format!(
                    "SSH key not found in Vault: {id}"
                )));
            }
            return Ok((Some(id.to_string()), None));
        }

        let clean_path = private_key_path
            .map(normalize_key_path_input)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                CoreError::Validation(
                    "SSH Key authentication requires selecting a key or providing a Key Path."
                        .to_string(),
                )
            })?;

        let key_path = Path::new(&clean_path);
        if key_path.exists() {
            let _ = restrict_private_key_acl(key_path);
        }

        Ok((None, Some(clean_path)))
    }

    fn resolve_password_binding(
        &self,
        host_id: &str,
        auth_method: &str,
        password_mode: Option<&str>,
        password: Option<&str>,
        existing_secret_ref: Option<String>,
    ) -> CoreResult<(String, Option<String>)> {
        if auth_method != "PASSWORD" {
            if let Some(ref old_ref) = existing_secret_ref {
                let _ = self.vault.delete_secret(old_ref);
            }
            return Ok(("NONE".to_string(), None));
        }
        let mode = password_mode.unwrap_or("PROMPT_EVERY_TIME");
        if mode == "SAVED" {
            if let Some(pw) = password.filter(|p| !p.is_empty()) {
                let ref_id = SecretVault::host_password_ref(host_id);
                self.vault.store_secret(&ref_id, pw)?;
                return Ok(("SAVED".to_string(), Some(ref_id)));
            }
            if existing_secret_ref.is_some() {
                return Ok(("SAVED".to_string(), existing_secret_ref));
            }
        } else if let Some(ref old_ref) = existing_secret_ref {
            let _ = self.vault.delete_secret(old_ref);
        }
        Ok(("PROMPT_EVERY_TIME".to_string(), None))
    }
}
