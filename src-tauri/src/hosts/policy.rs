use std::path::Path;

use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::infra::db::{key_repo, port_forward_repo};
use crate::infra::os::restrict_private_key_acl;
use crate::infra::security::SecretVault;
use crate::ipc::dto::SavePortForwardDto;
use crate::keys::normalize_key_path_input;

pub(super) enum PendingVaultOp {
    None,
    Store {
        ref_id: String,
        secret: Zeroizing<String>,
    },
    Delete(String),
}

pub(super) fn validate_host_fields(
    alias: &str,
    host: &str,
    port: u16,
    username: &str,
    auth_method: &str,
) -> CoreResult<()> {
    if alias.trim().is_empty() {
        return Err(CoreError::Validation("Alias cannot be empty".to_string()));
    }
    let trimmed_host = host.trim();
    if trimmed_host.is_empty() {
        return Err(CoreError::Validation("Host/IP cannot be empty".to_string()));
    }
    if trimmed_host.starts_with('-') {
        return Err(CoreError::Validation(format!(
            "Host cannot start with a hyphen '-': '{trimmed_host}'"
        )));
    }
    if trimmed_host.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CoreError::Validation(format!(
            "Host contains invalid whitespace or control characters: '{trimmed_host}'"
        )));
    }
    if port == 0 {
        return Err(CoreError::Validation(
            "Port must be between 1 and 65535".to_string(),
        ));
    }
    let trimmed_user = username.trim();
    if trimmed_user.is_empty() {
        return Err(CoreError::Validation("Username cannot be empty".to_string()));
    }
    if trimmed_user.starts_with('-') {
        return Err(CoreError::Validation(format!(
            "Username cannot start with a hyphen '-': '{trimmed_user}'"
        )));
    }
    if trimmed_user.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(CoreError::Validation(format!(
            "Username contains invalid whitespace or control characters: '{trimmed_user}'"
        )));
    }
    if auth_method != "SSH_KEY" && auth_method != "PASSWORD" {
        return Err(CoreError::Validation(format!(
            "Invalid auth_method '{auth_method}'"
        )));
    }
    Ok(())
}

pub(super) fn validate_port_forwards(rules: &[SavePortForwardDto]) -> CoreResult<()> {
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
pub(super) fn resolve_host_key_binding(
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

pub(super) fn plan_password_binding(
    host_id: &str,
    auth_method: &str,
    password_mode: Option<&str>,
    password: Option<&str>,
    existing_secret_ref: Option<String>,
) -> CoreResult<(String, Option<String>, PendingVaultOp)> {
    if auth_method != "PASSWORD" {
        return Ok((
            "NONE".to_string(),
            None,
            existing_secret_ref
                .map(PendingVaultOp::Delete)
                .unwrap_or(PendingVaultOp::None),
        ));
    }
    let mode = password_mode.unwrap_or("PROMPT_EVERY_TIME");
    if mode == "SAVED" {
        if let Some(pw) = password.filter(|p| !p.is_empty()) {
            let ref_id = SecretVault::host_password_ref(host_id);
            return Ok((
                "SAVED".to_string(),
                Some(ref_id.clone()),
                PendingVaultOp::Store {
                    ref_id,
                    secret: Zeroizing::new(pw.to_string()),
                },
            ));
        }
        if existing_secret_ref.is_some() {
            return Ok(("SAVED".to_string(), existing_secret_ref, PendingVaultOp::None));
        }
        return Err(CoreError::Validation(
            "Password is required".to_string(),
        ));
    } else if let Some(old_ref) = existing_secret_ref {
        return Ok((
            "PROMPT_EVERY_TIME".to_string(),
            None,
            PendingVaultOp::Delete(old_ref),
        ));
    }
    Ok(("PROMPT_EVERY_TIME".to_string(), None, PendingVaultOp::None))
}
