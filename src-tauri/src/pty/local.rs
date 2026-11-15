#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;
use tauri::AppHandle;
#[cfg(windows)]
use tracing::warn;

use crate::core::error::{CoreError, CoreResult};
use crate::hosts::HostService;
#[cfg(windows)]
use crate::infra::os::elevated_pty;
use crate::ipc::dto::{SessionConnectAckDto, SessionConnectRequestDto};

#[cfg(windows)]
use super::events::{
    emit_status, finalize_reader_exit, spawn_output_batcher, ReaderExitCtx, ReaderExitMeta,
};
use super::manager::PtySessionManager;
#[cfg(windows)]
use super::types::{PtyBackend, PtySession};

impl PtySessionManager {
    pub(super) fn connect_elevated_local(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        req: SessionConnectRequestDto,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<SessionConnectAckDto> {
        #[cfg(not(windows))]
        {
            let _ = (app, hosts, req, on_output);
            return Err(CoreError::Pty(
                "Elevated tabs are only supported on Windows".to_string(),
            ));
        }

        #[cfg(windows)]
        {
            let tab_id = req.tab_id;
            let host_id = req.host_id;
            emit_status(app, &tab_id, &host_id, "CONNECTING", vec![], None);

            let conn = match elevated_pty::spawn_elevated_pty(req.cols, req.rows) {
                Ok(c) => c,
                Err(msg) => {
                    emit_status(app, &tab_id, &host_id, "ERROR", vec![], Some(msg.clone()));
                    return Err(CoreError::Pty(msg));
                }
            };

            let pipe_out = conn.pipe_out.clone();
            let mut pipe_reader = elevated_pty::PipeReader(conn.pipe_out);
            let pipe_writer = elevated_pty::PipeWriter(conn.pipe_in);

            let session = Arc::new(PtySession {
                tab_id: Mutex::new(tab_id.clone()),
                host_id: host_id.clone(),
                ssh_key_id: None,
                is_admin: true,
                backend: PtyBackend::Elevated {
                    pipe_writer: Mutex::new(pipe_writer),
                    pipe_out,
                },
                pending_prompt_type: Mutex::new(None),
                manual_disconnect: AtomicBool::new(false),
            });

            self.sessions.insert(tab_id.clone(), session.clone());
            emit_status(app, &tab_id, &host_id, "ONLINE", vec![], None);
            self.telemetry_hub.register_tab(app, hosts, &host_id, &tab_id);

            let (tx, batcher_handle) = spawn_output_batcher(on_output.clone());
            let sessions_map = self.sessions.clone();
            let tunnel_reg = self.tunnel_registry.clone();
            let telemetry_hub = self.telemetry_hub.clone();
            let app_handle = app.clone();
            let reader_tab_id = tab_id.clone();
            let reader_host_id = host_id.clone();
            let session_ref = session.clone();

            std::thread::Builder::new()
                .name(format!("elevated-pty-reader-{reader_tab_id}"))
                .spawn(move || {
                    let mut exit_code: Option<u32> = None;

                    loop {
                        match pipe_reader.read_next_frame() {
                            Ok(None) => break,
                            Ok(Some((elevated_pty::FRAME_DATA, payload))) => {
                                if tx.send(payload).is_err() {
                                    break;
                                }
                            }
                            Ok(Some((elevated_pty::FRAME_EXIT, payload))) => {
                                if payload.len() >= 5 && payload[0] == 1 {
                                    exit_code = Some(u32::from_le_bytes([
                                        payload[1], payload[2], payload[3], payload[4],
                                    ]));
                                }
                                break;
                            }
                            Ok(Some((elevated_pty::FRAME_ERROR, payload))) => {
                                let msg = String::from_utf8_lossy(&payload);
                                let _ = on_output
                                    .send(format!("\r\n\x1b[31m✖ {msg}\x1b[0m\r\n").into_bytes());
                                exit_code = Some(1);
                                break;
                            }
                            Ok(Some(_)) => {}
                            Err(e) => {
                                let was_manual = session_ref.manual_disconnect.load(Ordering::SeqCst);
                                // ERROR_OPERATION_ABORTED (995) is expected when CancelIoEx aborts ReadFile on disconnect.
                                if !was_manual && e.raw_os_error() != Some(995) {
                                    warn!("Elevated PTY pipe read error on {reader_tab_id}: {e}");
                                }
                                break;
                            }
                        }
                    }

                    drop(tx);
                    let _ = tauri::async_runtime::block_on(batcher_handle);

                    let was_manual = session_ref.manual_disconnect.load(Ordering::SeqCst);
                    finalize_reader_exit(
                        ReaderExitCtx {
                            sessions_map: &sessions_map,
                            tunnel_reg: &tunnel_reg,
                            telemetry_hub: &telemetry_hub,
                            app_handle: &app_handle,
                            on_output: &on_output,
                            session_ref: &session_ref,
                        },
                        ReaderExitMeta {
                            tab_id: reader_tab_id,
                            host_id: reader_host_id,
                            was_manual,
                            exit_code,
                            auth_failed_reason: None,
                        },
                    );
                })
                .map_err(|e| {
                    CoreError::Pty(format!("Failed to spawn elevated PTY reader thread: {e}"))
                })?;

            Ok(SessionConnectAckDto {
                tab_id,
                host_id,
                pid: None,
                cli_preview: "powershell.exe (Admin)".to_string(),
                status: "ONLINE".to_string(),
                is_admin: true,
            })
        }
    }
}
