use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;
use tauri::AppHandle;

use crate::hosts::HostService;
use crate::infra::os::is_process_elevated;
use crate::ipc::dto::{SessionConnectAckDto, SessionConnectRequestDto};

use super::events::{
    emit_status, finalize_reader_exit, spawn_output_batcher, ReaderExitCtx, ReaderExitMeta,
};
use super::manager::PtySessionManager;
use super::types::{
    AttachedTabTarget, PrewarmSink, PrewarmedLocalSession, PtyBackend, PtySession,
    PREWARM_BUFFER_LIMIT, READ_BUF_SIZE,
};

pub(super) fn build_local_powershell_command() -> CommandBuilder {
    let mut c = CommandBuilder::new("powershell.exe");
    c.arg("-NoLogo");
    if let Ok(home) = std::env::var("USERPROFILE") {
        c.cwd(home);
    }
    c.env("TERM", "xterm-256color");
    c.env("COLORTERM", "truecolor");
    c
}

impl PtySessionManager {
    /// Spawns the initial local PowerShell ConPTY in the background while WebView2 initializes.
    pub fn prewarm_local_shell(&self, cols: u16, rows: u16) {
        let initial_cols = cols.max(10);
        let initial_rows = rows.max(2);
        let is_admin = is_process_elevated();
        let manager = self.clone();

        let _ = std::thread::Builder::new()
            .name("conpty-prewarm-local".to_string())
            .spawn(move || {
                if manager.prewarm_cancelled.load(Ordering::SeqCst) {
                    return;
                }

                let pty_system = native_pty_system();
                let Ok(pair) = pty_system.openpty(PtySize {
                    rows: initial_rows,
                    cols: initial_cols,
                    pixel_width: 0,
                    pixel_height: 0,
                }) else {
                    return;
                };

                let Ok(mut child) = pair.slave.spawn_command(build_local_powershell_command()) else {
                    return;
                };
                drop(pair.slave);

                if manager.prewarm_cancelled.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    return;
                }

                let pid = child.process_id();
                if let Some(process_id) = pid {
                    let _ = manager.job_supervisor.assign_pid(process_id);
                }

                let Ok(writer) = pair.master.take_writer() else {
                    let _ = child.kill();
                    return;
                };
                let Ok(mut reader) = pair.master.try_clone_reader() else {
                    let _ = child.kill();
                    return;
                };

                let session = Arc::new(PtySession {
                    tab_id: Mutex::new("__prewarm__".to_string()),
                    host_id: "local".to_string(),
                    ssh_key_id: None,
                    is_admin,
                    backend: PtyBackend::Direct {
                        master: Mutex::new(pair.master),
                        writer: Mutex::new(writer),
                        child: Mutex::new(child),
                    },
                    pending_prompt_type: Mutex::new(None),
                    manual_disconnect: AtomicBool::new(false),
                });

                let sink = Arc::new(Mutex::new(PrewarmSink::Buffering(Vec::with_capacity(4096))));
                let attached: Arc<Mutex<Option<AttachedTabTarget>>> = Arc::new(Mutex::new(None));

                let prewarmed = PrewarmedLocalSession {
                    session: session.clone(),
                    pid,
                    is_admin,
                    initial_cols,
                    initial_rows,
                    sink: sink.clone(),
                    attached: attached.clone(),
                };

                if let Ok(mut guard) = manager.prewarmed_local.lock() {
                    if manager.prewarm_cancelled.load(Ordering::SeqCst) {
                        session.manual_disconnect.store(true, Ordering::SeqCst);
                        session.terminate();
                        return;
                    }
                    *guard = Some(prewarmed);
                } else {
                    session.manual_disconnect.store(true, Ordering::SeqCst);
                    session.terminate();
                    return;
                }

                let sessions_map = manager.sessions.clone();
                let tunnel_reg = manager.tunnel_registry.clone();
                let telemetry_hub = manager.telemetry_hub.clone();
                let session_ref = session;

                let _ = std::thread::Builder::new()
                    .name("conpty-reader-prewarm".to_string())
                    .spawn(move || {
                        let mut buf = [0u8; READ_BUF_SIZE];
                        loop {
                            match reader.read(&mut buf) {
                                Ok(0) => break,
                                Ok(n) => {
                                    let slice = &buf[..n];
                                    let Ok(mut guard) = sink.lock() else {
                                        break;
                                    };
                                    match &mut *guard {
                                        PrewarmSink::Buffering(buffered) => {
                                            if buffered.len() < PREWARM_BUFFER_LIMIT {
                                                let remaining =
                                                    PREWARM_BUFFER_LIMIT - buffered.len();
                                                buffered.extend_from_slice(
                                                    &slice[..slice.len().min(remaining)],
                                                );
                                            }
                                        }
                                        PrewarmSink::Streaming(tx) => {
                                            if tx.send(slice.to_vec()).is_err() {
                                                break;
                                            }
                                        }
                                        PrewarmSink::Closed => break,
                                    }
                                }
                                Err(_) => break,
                            }
                        }

                        if let Ok(mut guard) = sink.lock() {
                            *guard = PrewarmSink::Closed;
                        }

                        let maybe_target = attached.lock().ok().and_then(|mut g| g.take());
                        let exit_code = session_ref.wait_exit_code();

                        if let Some(target) = maybe_target {
                            let _ = tauri::async_runtime::block_on(target.batcher_handle);
                            let was_manual = session_ref.manual_disconnect.load(Ordering::SeqCst);
                            finalize_reader_exit(
                                ReaderExitCtx {
                                    sessions_map: &sessions_map,
                                    tunnel_reg: &tunnel_reg,
                                    telemetry_hub: &telemetry_hub,
                                    app_handle: &target.app,
                                    on_output: &target.on_output,
                                    session_ref: &session_ref,
                                },
                                ReaderExitMeta {
                                    tab_id: target.tab_id,
                                    host_id: "local".to_string(),
                                    was_manual,
                                    exit_code,
                                    auth_failed_reason: None,
                                },
                            );
                        }
                    });
            });
    }

    pub(super) fn try_claim_prewarmed_local(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        req: &SessionConnectRequestDto,
        is_admin: bool,
        on_output: &Channel<Vec<u8>>,
    ) -> Option<SessionConnectAckDto> {
        let taken = {
            let mut guard = self.prewarmed_local.lock().ok()?;
            self.prewarm_cancelled.store(true, Ordering::SeqCst);
            guard.take()
        }?;

        if taken.is_admin != is_admin {
            taken.session.manual_disconnect.store(true, Ordering::SeqCst);
            taken.session.terminate();
            return None;
        }

        let (tx, batcher_handle) = spawn_output_batcher(on_output.clone());
        if let Ok(mut attached_guard) = taken.attached.lock() {
            *attached_guard = Some(AttachedTabTarget {
                app: app.clone(),
                tab_id: req.tab_id.clone(),
                on_output: on_output.clone(),
                batcher_handle,
            });
        } else {
            taken.session.manual_disconnect.store(true, Ordering::SeqCst);
            taken.session.terminate();
            return None;
        }

        let buffered = {
            let Ok(mut sink_guard) = taken.sink.lock() else {
                if let Ok(mut attached_guard) = taken.attached.lock() {
                    attached_guard.take();
                }
                taken.session.manual_disconnect.store(true, Ordering::SeqCst);
                taken.session.terminate();
                return None;
            };
            if matches!(&*sink_guard, PrewarmSink::Closed) {
                drop(sink_guard);
                if let Ok(mut attached_guard) = taken.attached.lock() {
                    attached_guard.take();
                }
                return None;
            }
            match std::mem::replace(&mut *sink_guard, PrewarmSink::Streaming(tx.clone())) {
                PrewarmSink::Buffering(buf) => buf,
                PrewarmSink::Streaming(_) | PrewarmSink::Closed => Vec::new(),
            }
        };

        taken.session.set_tab_id(&req.tab_id);
        self.sessions.insert(req.tab_id.clone(), taken.session.clone());
        emit_status(app, &req.tab_id, "local", "ONLINE", vec![], None);
        self.telemetry_hub.register_tab(app, hosts, "local", &req.tab_id);

        if !buffered.is_empty() {
            let _ = tx.send(buffered);
        }

        let target_cols = req.cols.max(10);
        let target_rows = req.rows.max(2);
        if target_cols != taken.initial_cols || target_rows != taken.initial_rows {
            let _ = taken.session.resize(target_cols, target_rows);
        }

        Some(SessionConnectAckDto {
            tab_id: req.tab_id.clone(),
            host_id: "local".to_string(),
            pid: taken.pid,
            cli_preview: "powershell.exe".to_string(),
            status: "ONLINE".to_string(),
            is_admin: taken.is_admin,
        })
    }
}
