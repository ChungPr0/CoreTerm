use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tracing::warn;

use crate::core::defaults::LOCAL_HOST_ID;
use crate::ipc::dto::{
    PortForwardStatusDto, SessionAuthPromptEventDto, SessionHostKeyPromptEventDto,
    SessionStatusEventDto,
};
use crate::ipc::events::{
    EVENT_SESSION_AUTH_PROMPT, EVENT_SESSION_HOST_KEY_PROMPT, EVENT_SESSION_STATUS,
};
use crate::ssh::ActiveTunnelRegistry;

use super::types::{PtySession, BATCH_WINDOW_MS, MAX_BATCH_SIZE};

pub(super) struct ReaderExitCtx<'a> {
    pub sessions_map: &'a DashMap<String, Arc<PtySession>>,
    pub tunnel_reg: &'a ActiveTunnelRegistry,
    pub app_handle: &'a AppHandle,
    pub on_output: &'a Channel<Vec<u8>>,
    pub session_ref: &'a Arc<PtySession>,
}

pub(super) struct ReaderExitMeta {
    pub tab_id: String,
    pub host_id: String,
    pub was_manual: bool,
    pub exit_code: Option<u32>,
    pub auth_failed_reason: Option<String>,
    pub connect_failed_reason: Option<String>,
}

pub(super) fn emit_status(
    app: &AppHandle,
    tab_id: &str,
    host_id: &str,
    state: &str,
    active_local_forwards: Vec<PortForwardStatusDto>,
    error_message: Option<String>,
) {
    let payload = SessionStatusEventDto {
        tab_id: tab_id.to_string(),
        host_id: host_id.to_string(),
        state: state.to_string(),
        active_local_forwards,
        error_message,
    };
    if let Err(e) = app.emit(EVENT_SESSION_STATUS, payload) {
        warn!("Failed to emit session:status event for tab {tab_id}: {e}");
    }
}

pub(super) fn emit_auth_prompt(
    app: &AppHandle,
    tab_id: &str,
    host_id: &str,
    prompt_type: &str,
    prompt_text: String,
    attempt: u8,
) {
    let payload = SessionAuthPromptEventDto {
        tab_id: tab_id.to_string(),
        host_id: host_id.to_string(),
        prompt_type: prompt_type.to_string(),
        prompt_text,
        attempt,
    };
    let _ = app.emit(EVENT_SESSION_AUTH_PROMPT, payload);
}

pub(super) fn emit_host_key_prompt(app: &AppHandle, payload: SessionHostKeyPromptEventDto) {
    let _ = app.emit(EVENT_SESSION_HOST_KEY_PROMPT, payload);
}

pub(super) const PTY_BATCHER_CHANNEL_CAPACITY: usize = 256;

pub(super) fn spawn_output_batcher(
    on_output: Channel<Vec<u8>>,
) -> (
    tokio::sync::mpsc::Sender<Vec<u8>>,
    tauri::async_runtime::JoinHandle<()>,
) {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(PTY_BATCHER_CHANNEL_CAPACITY);
    let handle = tauri::async_runtime::spawn(async move {
        let mut batch_buf: Vec<u8> = Vec::with_capacity(MAX_BATCH_SIZE);
        loop {
            let Some(first_chunk) = rx.recv().await else {
                break;
            };
            batch_buf.extend_from_slice(&first_chunk);

            let deadline = tokio::time::Instant::now() + Duration::from_millis(BATCH_WINDOW_MS);
            while batch_buf.len() < MAX_BATCH_SIZE {
                match tokio::time::timeout_at(deadline, rx.recv()).await {
                    Ok(Some(more)) => batch_buf.extend_from_slice(&more),
                    Ok(None) | Err(_) => break,
                }
            }

            if !batch_buf.is_empty() {
                let payload =
                    std::mem::replace(&mut batch_buf, Vec::with_capacity(MAX_BATCH_SIZE));
                if on_output.send(payload).is_err() {
                    break;
                }
            }
        }
    });
    (tx, handle)
}

fn resolve_exit_status(
    host_id: &str,
    exit_code: Option<u32>,
    auth_failed_reason: Option<String>,
    connect_failed_reason: Option<String>,
) -> (&'static str, Option<String>) {
    if let Some(reason) = auth_failed_reason {
        ("AUTH_FAILED", Some(reason))
    } else if let Some(reason) = connect_failed_reason {
        ("ERROR", Some(reason))
    } else if host_id == LOCAL_HOST_ID {
        ("DISCONNECTED", None)
    } else {
        match exit_code {
            Some(0) | None => ("DISCONNECTED", None),
            Some(code) => ("ERROR", Some(format!("Process exited with code {code}"))),
        }
    }
}

pub(super) fn finalize_reader_exit(ctx: ReaderExitCtx<'_>, meta: ReaderExitMeta) {
    let removed = ctx
        .sessions_map
        .remove_if(&meta.tab_id, |_, current| Arc::ptr_eq(current, ctx.session_ref));
    if removed.is_some() {
        ctx.tunnel_reg.release_tab_tunnels(&meta.tab_id);
    }

    if !meta.was_manual {
        let (final_state, err_msg) = resolve_exit_status(
            &meta.host_id,
            meta.exit_code,
            meta.auth_failed_reason,
            meta.connect_failed_reason,
        );

        let exit_banner = match meta.exit_code {
            Some(0) | None => "\r\n\x1b[90m[Session closed.]\x1b[0m\r\n".to_string(),
            Some(code) => format!("\r\n\x1b[31m[Process exited with code {code}.]\x1b[0m\r\n"),
        };
        let _ = ctx.on_output.send(exit_banner.into_bytes());

        emit_status(
            ctx.app_handle,
            &meta.tab_id,
            &meta.host_id,
            final_state,
            vec![],
            err_msg,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_exit_status;

    #[test]
    fn local_shell_nonzero_exit_is_disconnected_not_launch_error() {
        assert_eq!(
            resolve_exit_status("local", Some(9009), None, None),
            ("DISCONNECTED", None)
        );
        assert_eq!(
            resolve_exit_status("local", Some(1), None, None),
            ("DISCONNECTED", None)
        );
        assert_eq!(
            resolve_exit_status("local", Some(0), None, None),
            ("DISCONNECTED", None)
        );
    }

    #[test]
    fn local_shell_with_connect_error_preserves_error_state() {
        assert_eq!(
            resolve_exit_status("local", Some(1), None, Some("Failed to spawn".into())),
            ("ERROR", Some("Failed to spawn".into()))
        );
    }

    #[test]
    fn ssh_session_nonzero_exit_reports_error() {
        assert_eq!(
            resolve_exit_status("host-1", Some(255), None, None),
            ("ERROR", Some("Process exited with code 255".into()))
        );
        assert_eq!(
            resolve_exit_status("host-1", Some(0), None, None),
            ("DISCONNECTED", None)
        );
        assert_eq!(
            resolve_exit_status("host-1", Some(255), Some("Auth failed".into()), None),
            ("AUTH_FAILED", Some("Auth failed".into()))
        );
    }
}
