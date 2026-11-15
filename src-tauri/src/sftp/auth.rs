use std::sync::{Arc, Mutex};

use russh::client::{self, AuthResult, DisconnectReason, KeyboardInteractiveAuthResponse};
use russh::keys::{self, PrivateKeyWithHashAlg, PublicKey};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

use crate::core::error::{dedupe_error_text, CoreError, CoreResult};
use crate::hosts::HostService;
use crate::ipc::dto::{
    HostFullConfigDto, SftpAuthPromptEventDto, SftpHostKeyPromptEventDto,
};
use crate::keys::KeyService;
use crate::ssh::known_hosts::{
    record_known_host, remove_host_from_known_hosts, verify_server_host_key, HostKeyCheckOutcome,
};

use super::session::{emit_status, map_russh_error};

pub const EVENT_SFTP_AUTH_PROMPT: &str = "sftp:auth_prompt";
pub const EVENT_SFTP_HOST_KEY_PROMPT: &str = "sftp:host_key_prompt";

pub struct PendingHostKeyChallenge {
    pub host: String,
    pub port: u16,
    pub pubkey: PublicKey,
    pub tx: oneshot::Sender<bool>,
}

pub struct PendingSecretChallenge {
    pub prompt_type: String,
    pub tx: oneshot::Sender<Option<(Zeroizing<String>, bool)>>,
}

#[derive(Clone, Default)]
pub struct PendingPromptSlots {
    pub host_key: Arc<Mutex<Option<PendingHostKeyChallenge>>>,
    pub secret: Arc<Mutex<Option<PendingSecretChallenge>>>,
}

impl PendingPromptSlots {
    /// Rejects any awaiting auth/host-key prompts when the tab disconnects or cancels.
    pub fn cancel_all(&self) {
        if let Ok(mut guard) = self.host_key.lock() {
            if let Some(ch) = guard.take() {
                let _ = ch.tx.send(false);
            }
        }
        if let Ok(mut guard) = self.secret.lock() {
            if let Some(ch) = guard.take() {
                let _ = ch.tx.send(None);
            }
        }
    }
}

pub struct RusshClientHandler {
    pub tab_id: String,
    pub host_id: String,
    pub host: String,
    pub port: u16,
    pub strict_mode: String,
    pub app: AppHandle,
    pub prompts: PendingPromptSlots,
    pub cancel_token: CancellationToken,
}

impl client::Handler for RusshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let pubkey = server_public_key.public_key();
        match verify_server_host_key(&self.host, self.port, &self.strict_mode, &pubkey) {
            HostKeyCheckOutcome::Trusted => Ok(true),
            HostKeyCheckOutcome::PromptRequired {
                reason,
                algorithm,
                fingerprint,
            } => {
                let (tx, rx) = oneshot::channel();
                {
                    let mut slot = self
                        .prompts
                        .host_key
                        .lock()
                        .map_err(|_| russh::Error::Disconnect)?;
                    *slot = Some(PendingHostKeyChallenge {
                        host: self.host.clone(),
                        port: self.port,
                        pubkey,
                        tx,
                    });
                }

                let _ = self.app.emit(
                    EVENT_SFTP_HOST_KEY_PROMPT,
                    SftpHostKeyPromptEventDto {
                        tab_id: self.tab_id.clone(),
                        host_id: self.host_id.clone(),
                        host: self.host.clone(),
                        port: self.port,
                        algorithm,
                        fingerprint,
                        reason,
                    },
                );

                tokio::select! {
                    _ = self.cancel_token.cancelled() => Ok(false),
                    decision = rx => Ok(decision.unwrap_or(false)),
                }
            }
        }
    }

    async fn disconnected(
        &mut self,
        reason: DisconnectReason<Self::Error>,
    ) -> Result<(), Self::Error> {
        if !self.cancel_token.is_cancelled() {
            match &reason {
                DisconnectReason::ReceivedDisconnect(info) => {
                    let msg = info.message.trim();
                    let err_opt = if msg.is_empty() {
                        None
                    } else {
                        Some(dedupe_error_text(msg))
                    };
                    emit_status(
                        &self.app,
                        &self.tab_id,
                        &self.host_id,
                        "DISCONNECTED",
                        None,
                        err_opt,
                    );
                }
                DisconnectReason::Error(err) => {
                    emit_status(
                        &self.app,
                        &self.tab_id,
                        &self.host_id,
                        "ERROR",
                        None,
                        Some(dedupe_error_text(&err.to_string())),
                    );
                }
            }
        }

        match reason {
            DisconnectReason::ReceivedDisconnect(_) => Ok(()),
            DisconnectReason::Error(err) => Err(err),
        }
    }
}

pub struct SftpAuthContext<'a> {
    pub tab_id: &'a str,
    pub config: &'a HostFullConfigDto,
    pub hosts: &'a HostService,
    pub keys: &'a KeyService,
    pub app: &'a AppHandle,
    pub prompts: &'a PendingPromptSlots,
    pub cancel_token: &'a CancellationToken,
}

/// Applies the user's host key decision (persisting to `known_hosts` before resuming the handshake).
pub fn apply_host_key_decision(
    slots: &PendingPromptSlots,
    action: &str,
) -> CoreResult<Option<(String, u16)>> {
    let mut guard = slots
        .host_key
        .lock()
        .map_err(|_| CoreError::Internal("Host key prompt lock poisoned".to_string()))?;
    let Some(challenge) = guard.take() else {
        return Err(CoreError::NotFound(
            "No pending SFTP host key verification prompt".to_string(),
        ));
    };

    let info = (challenge.host.clone(), challenge.port);
    match action {
        "ACCEPT" => {
            record_known_host(&challenge.host, challenge.port, &challenge.pubkey)?;
            let _ = challenge.tx.send(true);
            Ok(Some(info))
        }
        "REMOVE_OLD_AND_ACCEPT" => {
            remove_host_from_known_hosts(&challenge.host, challenge.port);
            record_known_host(&challenge.host, challenge.port, &challenge.pubkey)?;
            let _ = challenge.tx.send(true);
            Ok(Some(info))
        }
        "REJECT" => {
            let _ = challenge.tx.send(false);
            Ok(None)
        }
        other => {
            let _ = challenge.tx.send(false);
            Err(CoreError::Validation(format!(
                "Unsupported host key action: {other}"
            )))
        }
    }
}

pub fn deliver_secret_decision(
    slots: &PendingPromptSlots,
    secret: Option<(Zeroizing<String>, bool)>,
) -> CoreResult<()> {
    let mut guard = slots
        .secret
        .lock()
        .map_err(|_| CoreError::Internal("Secret prompt lock poisoned".to_string()))?;
    let Some(challenge) = guard.take() else {
        return Err(CoreError::NotFound(
            "No pending SFTP authentication prompt".to_string(),
        ));
    };
    let _ = challenge.tx.send(secret);
    Ok(())
}

pub async fn authenticate_session(
    session: &mut client::Handle<RusshClientHandler>,
    ctx: &SftpAuthContext<'_>,
) -> CoreResult<()> {
    let username = ctx.config.username.trim();
    match ctx.config.auth_method.as_str() {
        "SSH_KEY" => {
            let key_path = ctx
                .config
                .private_key_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    CoreError::Validation(
                        "SSH_KEY authentication requires a valid private_key_path".to_string(),
                    )
                })?;

            let priv_key = load_private_key_with_prompts(key_path, ctx).await?;

            let hash_alg = if priv_key.algorithm().is_rsa() {
                session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| map_russh_error("Failed to negotiate RSA hash", e))?
                    .flatten()
            } else {
                None
            };

            let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(priv_key), hash_alg);
            let res = session
                .authenticate_publickey(username, key_with_hash)
                .await
                .map_err(|e| map_russh_error("Public key authentication failed", e))?;
            if res.success() {
                Ok(())
            } else {
                Err(CoreError::Sftp(
                    "SSH server rejected the private key".to_string(),
                ))
            }
        }
        "PASSWORD" => authenticate_password_with_prompts(session, ctx).await,
        other => Err(CoreError::Validation(format!(
            "Unsupported auth_method: {other}"
        ))),
    }
}

async fn load_private_key_with_prompts(
    key_path: &str,
    ctx: &SftpAuthContext<'_>,
) -> CoreResult<keys::PrivateKey> {
    match keys::load_secret_key(key_path, None) {
        Ok(key) => return Ok(key),
        Err(keys::Error::KeyIsEncrypted) => {}
        Err(e) => {
            return Err(CoreError::Sftp(format!(
                "Failed to load SSH private key '{key_path}': {e}"
            )));
        }
    }

    if let Some(ref key_id) = ctx.config.ssh_key_id {
        if let Ok(Some(saved_pass)) = ctx.keys.get_secret(key_id) {
            if let Ok(key) = keys::load_secret_key(key_path, Some(saved_pass.as_str())) {
                return Ok(key);
            }
        }
    }

    for attempt in 1..=3u8 {
        let prompt_text = format!("Enter passphrase for key {key_path}");
        let Some((secret, save_to_vault)) =
            request_secret_from_user(ctx, "KEY_PASSPHRASE", &prompt_text, attempt).await?
        else {
            return Err(CoreError::Sftp(
                "Key passphrase prompt was cancelled".to_string(),
            ));
        };

        if let Ok(key) = keys::load_secret_key(key_path, Some(secret.as_str())) {
            if save_to_vault {
                if let Some(ref key_id) = ctx.config.ssh_key_id {
                    let _ = ctx.keys.save_secret(key_id, secret.as_str());
                }
            }
            return Ok(key);
        }
    }

    Err(CoreError::Sftp(
        "Invalid SSH key passphrase after 3 attempts".to_string(),
    ))
}

async fn authenticate_password_with_prompts(
    session: &mut client::Handle<RusshClientHandler>,
    ctx: &SftpAuthContext<'_>,
) -> CoreResult<()> {
    let username = ctx.config.username.trim();
    if let Ok(Some(saved_pw)) = ctx.hosts.get_secret(&ctx.config.id) {
        if try_password_and_kbd(session, username, saved_pw.as_str()).await? {
            return Ok(());
        }
    }

    for attempt in 1..=3u8 {
        let prompt_text = format!(
            "{}@{}:{} password:",
            username,
            ctx.config.host.trim(),
            ctx.config.port
        );
        let Some((secret, save_to_vault)) =
            request_secret_from_user(ctx, "PASSWORD", &prompt_text, attempt).await?
        else {
            return Err(CoreError::Sftp("Authentication cancelled".to_string()));
        };

        if try_password_and_kbd(session, username, secret.as_str()).await? {
            if save_to_vault {
                let _ = ctx.hosts.save_secret(&ctx.config.id, secret.as_str());
            }
            return Ok(());
        }
    }

    Err(CoreError::Sftp(
        "Authentication failed after 3 attempts".to_string(),
    ))
}

async fn try_password_and_kbd(
    session: &mut client::Handle<RusshClientHandler>,
    username: &str,
    password: &str,
) -> CoreResult<bool> {
    let auth_res = session
        .authenticate_password(username, password)
        .await
        .map_err(|e| map_russh_error("Password authentication error", e))?;
    if auth_res.success() {
        return Ok(true);
    }

    if let AuthResult::Failure {
        remaining_methods, ..
    } = auth_res
    {
        if remaining_methods.contains(&russh::MethodKind::KeyboardInteractive) {
            let mut kbd = session
                .authenticate_keyboard_interactive_start(username, None)
                .await
                .map_err(|e| map_russh_error("Keyboard-interactive auth error", e))?;
            loop {
                match kbd {
                    KeyboardInteractiveAuthResponse::Success => return Ok(true),
                    KeyboardInteractiveAuthResponse::Failure { .. } => return Ok(false),
                    KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                        let answers = vec![password.to_string(); prompts.len()];
                        kbd = session
                            .authenticate_keyboard_interactive_respond(answers)
                            .await
                            .map_err(|e| {
                                map_russh_error("Keyboard-interactive response error", e)
                            })?;
                    }
                }
            }
        }
    }

    Ok(false)
}

async fn request_secret_from_user(
    ctx: &SftpAuthContext<'_>,
    prompt_type: &str,
    prompt_text: &str,
    attempt: u8,
) -> CoreResult<Option<(Zeroizing<String>, bool)>> {
    let (tx, rx) = oneshot::channel();
    {
        let mut slot = ctx
            .prompts
            .secret
            .lock()
            .map_err(|_| CoreError::Internal("Secret prompt lock poisoned".to_string()))?;
        *slot = Some(PendingSecretChallenge {
            prompt_type: prompt_type.to_string(),
            tx,
        });
    }

    let _ = ctx.app.emit(
        EVENT_SFTP_AUTH_PROMPT,
        SftpAuthPromptEventDto {
            tab_id: ctx.tab_id.to_string(),
            host_id: ctx.config.id.clone(),
            prompt_type: prompt_type.to_string(),
            prompt_text: prompt_text.to_string(),
            attempt,
        },
    );

    tokio::select! {
        _ = ctx.cancel_token.cancelled() => Err(CoreError::Sftp("Connection cancelled".to_string())),
        ans = rx => Ok(ans.unwrap_or(None)),
    }
}
