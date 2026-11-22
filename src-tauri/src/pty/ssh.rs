use std::collections::HashSet;
use std::ffi::OsString;
use std::sync::Arc;

use tauri::AppHandle;
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::hosts::HostService;
use crate::ipc::dto::{PortForwardStatusDto, SessionHostKeyPromptEventDto};
use crate::keys::KeyService;
use crate::pty::expect::ExpectSignal;
use crate::ssh::{ActiveTunnelRegistry, SshCommandCompiler};

use super::events::{emit_auth_prompt, emit_host_key_prompt, emit_status};
use super::types::PtySession;

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

pub(super) struct SshExpectContext<'a> {
    pub app: &'a AppHandle,
    pub hosts: &'a HostService,
    pub keys: &'a KeyService,
    pub session: &'a Arc<PtySession>,
    pub tab_id: &'a str,
    pub host_id: &'a str,
    pub auth_method: &'a str,
    pub target_host: &'a str,
    pub target_port: u16,
    pub host_pw_mode: &'a str,
    pub active_forwards: &'a [PortForwardStatusDto],
}

/// Resolves SSH tunnel conflicts, compiles `ssh.exe` CLI arguments, and reserves local forwards.
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

fn try_auto_fill_or_prompt(
    ctx: &SshExpectContext<'_>,
    prompt_type: &str,
    prompt_text: String,
    attempt: u8,
    secret_opt: Option<Zeroizing<String>>,
) {
    let mut auto_filled = false;
    if let Some(secret) = secret_opt {
        let line = Zeroizing::new(format!("{}\r\n", secret.as_str()));
        if ctx.session.write_bytes(line.as_bytes()).is_ok() {
            auto_filled = true;
        }
    }
    if !auto_filled {
        emit_status(
            ctx.app,
            ctx.tab_id,
            ctx.host_id,
            "HANDSHAKING",
            ctx.active_forwards.to_vec(),
            None,
        );
        if let Ok(mut pending) = ctx.session.pending_prompt_type.lock() {
            *pending = Some(prompt_type.to_string());
        }
        emit_auth_prompt(
            ctx.app,
            ctx.tab_id,
            ctx.host_id,
            prompt_type,
            prompt_text,
            attempt,
        );
    }
}

/// Processes a ConPTY Expect signal and tracks terminal auth/connect errors before EOF.
pub(super) fn handle_expect_signal(
    signal: ExpectSignal,
    ctx: &SshExpectContext<'_>,
    auth_failed_reason: &mut Option<String>,
    connect_failed_reason: &mut Option<String>,
) {
    match signal {
        ExpectSignal::None => {}
        ExpectSignal::PasswordPrompt {
            prompt_text,
            attempt,
        } => {
            if ctx.auth_method != "PASSWORD" {
                return;
            }
            let secret = if attempt == 1 && ctx.host_pw_mode == "SAVED" {
                ctx.hosts.get_secret(ctx.host_id).ok().flatten()
            } else {
                None
            };
            try_auto_fill_or_prompt(ctx, "PASSWORD", prompt_text, attempt, secret);
        }
        ExpectSignal::PassphrasePrompt {
            prompt_text,
            attempt,
        } => {
            if ctx.auth_method != "SSH_KEY" {
                return;
            }
            let secret = if attempt == 1 {
                ctx.session
                    .ssh_key_id
                    .as_ref()
                    .and_then(|key_id| ctx.keys.get_secret(key_id).ok().flatten())
            } else {
                None
            };
            try_auto_fill_or_prompt(ctx, "KEY_PASSPHRASE", prompt_text, attempt, secret);
        }
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
