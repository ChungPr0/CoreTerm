use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tracing::warn;

use crate::ipc::dto::{
    PortForwardStatusDto, SessionAuthPromptEventDto, SessionHostKeyPromptEventDto,
    SessionStatusEventDto,
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
    if let Err(e) = app.emit("session:status", payload) {
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
    let _ = app.emit("session:auth_prompt", payload);
}

pub(super) fn emit_host_key_prompt(app: &AppHandle, payload: SessionHostKeyPromptEventDto) {
    let _ = app.emit("session:host_key_prompt", payload);
}

pub(super) fn spawn_output_batcher(
    on_output: Channel<Vec<u8>>,
) -> (
    tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
    tauri::async_runtime::JoinHandle<()>,
) {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    let handle = tauri::async_runtime::spawn(async move {
        let mut batch_buf: Vec<u8> = Vec::with_capacity(MAX_BATCH_SIZE);
        loop {
            let Some(first_chunk) = rx.recv().await else {
                break;
            };
            batch_buf.extend_from_slice(&first_chunk);

            let deadline =
                tokio::time::Instant::now() + Duration::from_millis(BATCH_WINDOW_MS);
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

pub(super) fn finalize_reader_exit(ctx: ReaderExitCtx<'_>, meta: ReaderExitMeta) {
    let removed = ctx
        .sessions_map
        .remove_if(&meta.tab_id, |_, current| Arc::ptr_eq(current, ctx.session_ref));
    if removed.is_some() {
        ctx.tunnel_reg.release_tab_tunnels(&meta.tab_id);
    }

    if !meta.was_manual {
        let (final_state, err_msg) = if let Some(reason) = meta.auth_failed_reason {
            ("AUTH_FAILED", Some(reason))
        } else {
            match meta.exit_code {
                Some(0) | None => ("DISCONNECTED", None),
                Some(code) => ("ERROR", Some(format!("Process exited with code {code}"))),
            }
        };

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
