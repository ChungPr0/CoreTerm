use std::collections::HashSet;
use std::ffi::OsString;
use std::sync::mpsc::sync_channel;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::hosts::HostService;
use crate::infra::security::{TabSecretKind, TabSecretStore};
use crate::ipc::dto::{PortForwardStatusDto, SessionHostKeyPromptEventDto};
use crate::ipc::events::EVENT_HOST_UPDATED;
use crate::keys::KeyService;
use crate::pty::askpass::{
    decide_askpass_action, spawn_askpass_server, AskpassDecision, AskpassPolicyState,
    AskpassServerHandle,
};
use crate::pty::expect::ExpectSignal;
use crate::ssh::{ActiveTunnelRegistry, SshCommandCompiler};

use super::events::{emit_auth_prompt, emit_host_key_prompt, emit_status};
use super::types::{
    AskpassSessionBridge, PendingAskpassHostKey, PendingAskpassSecret, PtySession,
};

pub(super) struct SshLaunchPlan {
    pub args: Vec<OsString>,
    pub cli_preview: String,
    pub active_forwards: Vec<PortForwardStatusDto>,
    pub auth_method: String,
    pub ssh_key_id: Option<String>,
    pub target_host: String,
    pub target_port: u16,
    pub host_pw_mode: String,
}

pub(super) struct SshAskpassContext {
    pub app: AppHandle,
    pub hosts: HostService,
    pub keys: KeyService,
    pub tab_secrets: TabSecretStore,
    pub bridge: Arc<AskpassSessionBridge>,
    pub tab_id: String,
    pub host_id: String,
    pub auth_method: String,
    pub ssh_key_id: Option<String>,
    pub target_host: String,
    pub target_port: u16,
    pub host_pw_mode: String,
    pub active_forwards: Vec<PortForwardStatusDto>,
}

pub(super) struct SshExpectContext<'a> {
    pub app: &'a AppHandle,
    pub hosts: &'a HostService,
    pub keys: &'a KeyService,
    pub tab_secrets: &'a TabSecretStore,
    pub session: &'a Arc<PtySession>,
    pub tab_id: &'a str,
    pub host_id: &'a str,
    pub target_host: &'a str,
    pub target_port: u16,
    pub active_forwards: &'a [PortForwardStatusDto],
}

pub(super) fn prepare_ssh_launch(
    app: &AppHandle,
    hosts: &HostService,
    tunnel_registry: &ActiveTunnelRegistry,
    tab_id: &str,
    host_id: &str,
    conflict_strategy: Option<&str>,
) -> CoreResult<SshLaunchPlan> {
    let config = match hosts.get_detail(host_id) {
        Ok(cfg) => cfg,
        Err(err) => {
            emit_status(app, tab_id, host_id, "ERROR", vec![], Some(err.to_string()));
            return Err(err);
        }
    };
    let strategy = conflict_strategy.unwrap_or("AUTO_SHARE_OR_SKIP");
    let probe_results = tunnel_registry.probe_host_rules(host_id, &config.port_forwards);
    let mut skipped_rule_ids: HashSet<String> = HashSet::new();

    for p in &probe_results {
        if p.status == "SHARED_WITH_ACTIVE_TAB" {
            skipped_rule_ids.insert(p.rule_id.clone());
        } else if p.status == "CONFLICT_EXTERNAL" {
            if strategy == "ABORT" {
                let msg = format!(
                    "Port {}:{} is already in use by {} (PID {})",
                    p.bind_address,
                    p.bind_port,
                    p.conflicting_process_name
                        .as_deref()
                        .unwrap_or("another process"),
                    p.conflicting_pid.unwrap_or(0)
                );
                emit_status(
                    app,
                    tab_id,
                    host_id,
                    "PORT_CONFLICT",
                    vec![],
                    Some(msg.clone()),
                );
                return Err(CoreError::Validation(msg));
            }
            skipped_rule_ids.insert(p.rule_id.clone());
        }
    }

    let args = match SshCommandCompiler::compile_args_with_skipped_rules(&config, &skipped_rule_ids)
    {
        Ok(a) => a,
        Err(err) => {
            emit_status(app, tab_id, host_id, "ERROR", vec![], Some(err.to_string()));
            return Err(err);
        }
    };
    let cli_preview = SshCommandCompiler::format_cli_preview(&args);
    let active_forwards = tunnel_registry.build_session_forward_statuses(
        tab_id,
        host_id,
        &config.port_forwards,
        &skipped_rule_ids,
    );

    Ok(SshLaunchPlan {
        args,
        cli_preview,
        active_forwards,
        auth_method: config.auth_method,
        ssh_key_id: config.ssh_key_id,
        target_host: config.host,
        target_port: config.port,
        host_pw_mode: config.password_mode,
    })
}

pub(super) fn spawn_ssh_askpass_server(ctx: SshAskpassContext) -> CoreResult<AskpassServerHandle> {
    let mut policy_state = AskpassPolicyState {
        auth_method: ctx.auth_method.clone(),
        host_pw_mode: ctx.host_pw_mode.clone(),
        password_attempts: 0,
        passphrase_attempts: 0,
    };

    spawn_askpass_server(move |prompt| {
        let decision = decide_askpass_action(
            &mut policy_state,
            prompt,
            || {
                ctx.tab_secrets
                    .get(&ctx.tab_id, &ctx.host_id, TabSecretKind::Password)
            },
            || ctx.hosts.get_secret(&ctx.host_id).ok().flatten(),
            || {
                ctx.tab_secrets
                    .get(&ctx.tab_id, &ctx.host_id, TabSecretKind::KeyPassphrase)
            },
            || {
                ctx.ssh_key_id
                    .as_ref()
                    .and_then(|key_id| ctx.keys.get_secret(key_id).ok().flatten())
            },
        );

        match decision {
            AskpassDecision::AutoFill(secret) => Some(secret),
            AskpassDecision::PromptHostKey {
                algorithm,
                fingerprint,
                reason,
            } => {
                let (tx, rx) = sync_channel(1);
                if let Ok(mut guard) = ctx.bridge.pending_host_key.lock() {
                    if let Some(prev) = guard.take() {
                        let _ = prev.tx.send(None);
                    }
                    *guard = Some(PendingAskpassHostKey { tx });
                } else {
                    return None;
                }

                emit_status(
                    &ctx.app,
                    &ctx.tab_id,
                    &ctx.host_id,
                    "HANDSHAKING",
                    ctx.active_forwards.clone(),
                    None,
                );
                emit_host_key_prompt(
                    &ctx.app,
                    SessionHostKeyPromptEventDto {
                        tab_id: ctx.tab_id.clone(),
                        host_id: ctx.host_id.clone(),
                        host: ctx.target_host.clone(),
                        port: ctx.target_port,
                        algorithm,
                        fingerprint,
                        reason,
                    },
                );

                rx.recv()
                    .ok()
                    .flatten()
                    .map(Zeroizing::new)
            }
            AskpassDecision::PromptUserSecret {
                prompt_type,
                prompt_text,
                attempt,
                is_reusable,
                clear_cached_secret,
            } => {
                if clear_cached_secret {
                    ctx.bridge.clear_staged_secret();
                    let kind = TabSecretKind::from_prompt_type(prompt_type);
                    ctx.tab_secrets.remove(&ctx.tab_id, &ctx.host_id, kind);
                }

                let (tx, rx) = sync_channel(1);
                if let Ok(mut guard) = ctx.bridge.pending_secret.lock() {
                    if let Some(prev) = guard.take() {
                        let _ = prev.tx.send(None);
                    }
                    *guard = Some(PendingAskpassSecret {
                        prompt_type: prompt_type.to_string(),
                        is_reusable,
                        tx,
                    });
                } else {
                    return None;
                }

                emit_status(
                    &ctx.app,
                    &ctx.tab_id,
                    &ctx.host_id,
                    "HANDSHAKING",
                    ctx.active_forwards.clone(),
                    None,
                );
                emit_auth_prompt(
                    &ctx.app,
                    &ctx.tab_id,
                    &ctx.host_id,
                    prompt_type,
                    prompt_text,
                    attempt,
                );

                rx.recv().ok().flatten()
            }
        }
    })
}

pub(super) fn handle_expect_signal(
    signal: ExpectSignal,
    ctx: &SshExpectContext<'_>,
    auth_failed_reason: &mut Option<String>,
    connect_failed_reason: &mut Option<String>,
) {
    match signal {
        ExpectSignal::None => {}
        ExpectSignal::HostKeyPrompt {
            algorithm,
            fingerprint,
            reason,
        } => {
            emit_status(
                ctx.app,
                ctx.tab_id,
                ctx.host_id,
                "HANDSHAKING",
                ctx.active_forwards.to_vec(),
                None,
            );
            emit_host_key_prompt(
                ctx.app,
                SessionHostKeyPromptEventDto {
                    tab_id: ctx.tab_id.to_string(),
                    host_id: ctx.host_id.to_string(),
                    host: ctx.target_host.to_string(),
                    port: ctx.target_port,
                    algorithm,
                    fingerprint,
                    reason,
                },
            );
        }
        ExpectSignal::AuthFailed { reason } => {
            ctx.session.shutdown_askpass();
            ctx.session.clear_staged_secret();
            ctx.tab_secrets.clear_tab(ctx.tab_id);
            *auth_failed_reason = Some(reason.clone());
            emit_status(
                ctx.app,
                ctx.tab_id,
                ctx.host_id,
                "AUTH_FAILED",
                vec![],
                Some(reason),
            );
        }
        ExpectSignal::ConnectFailed { reason } => {
            ctx.session.shutdown_askpass();
            *connect_failed_reason = Some(reason.clone());
            emit_status(
                ctx.app,
                ctx.tab_id,
                ctx.host_id,
                "ERROR",
                vec![],
                Some(reason),
            );
        }
        ExpectSignal::Connected => {
            ctx.session.shutdown_askpass();
            if let Some(staged) = ctx.session.take_staged_secret() {
                ctx.tab_secrets.set_with_key(
                    ctx.tab_id,
                    ctx.host_id,
                    staged.kind,
                    staged.secret.clone(),
                    ctx.session.ssh_key_id.as_deref(),
                );
                if staged.save_to_vault {
                    match staged.kind {
                        TabSecretKind::KeyPassphrase => {
                            if let Some(ref key_id) = ctx.session.ssh_key_id {
                                let _ = ctx.keys.save_secret(key_id, &staged.secret);
                            }
                        }
                        TabSecretKind::Password => {
                            if ctx
                                .hosts
                                .save_secret(ctx.host_id, &staged.secret, staged.auto_reconnect)
                                .is_ok()
                            {
                                if let Ok(updated) = ctx.hosts.get_detail(ctx.host_id) {
                                    let _ = ctx.app.emit(EVENT_HOST_UPDATED, updated);
                                }
                            }
                        }
                    }
                }
            }
            emit_status(
                ctx.app,
                ctx.tab_id,
                ctx.host_id,
                "ONLINE",
                ctx.active_forwards.to_vec(),
                None,
            );
        }
    }
}
