use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;
use tauri::AppHandle;

use crate::core::defaults::{MIN_PTY_COLS, MIN_PTY_ROWS};
use crate::infra::os::is_process_elevated;
use crate::ipc::dto::{SessionConnectAckDto, SessionConnectRequestDto, ShellProfile};

use super::events::{
    emit_status, finalize_reader_exit, spawn_output_batcher, ReaderExitCtx, ReaderExitMeta,
};
use super::manager::PtySessionManager;
use super::shells::{find_default_shell, is_default_powershell};
use super::spawn::{spawn_pty, PtySpawnConfig};
use super::types::{
    AttachedTabTarget, PrewarmSink, PrewarmedLocalSession, PREWARM_BUFFER_LIMIT, READ_BUF_SIZE,
};

fn profile_matches(prewarmed: &ShellProfile, requested: &ShellProfile) -> bool {
    if prewarmed.id == "powershell" && is_default_powershell(requested) {
        return true;
    }
    if prewarmed.id != requested.id || prewarmed.args != requested.args {
        return false;
    }
    prewarmed.executable.eq_ignore_ascii_case(&requested.executable)
        || std::path::Path::new(&prewarmed.executable)
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case(&requested.executable))
}

impl PtySessionManager {
    /// Spawns the highest-priority available local ConPTY in the background while WebView2 initializes.
    pub fn prewarm_local_shell(&self, cols: u16, rows: u16) {
        let initial_cols = cols.max(MIN_PTY_COLS);
        let initial_rows = rows.max(MIN_PTY_ROWS);
        let is_admin = is_process_elevated();
        let manager = self.clone();

        let _ = std::thread::Builder::new()
            .name("conpty-prewarm-local".to_string())
            .spawn(move || {
                if manager.prewarm_cancelled.load(Ordering::SeqCst) {
                    return;
                }

                #[allow(unused_mut)]
                let Some(mut profile) = find_default_shell() else {
                    return;
                };
                #[cfg(windows)]
                if is_admin {
                    let Ok(resolved) =
                        crate::infra::os::elevated_pty::resolve_elevated_shell_executable(
                            &profile.executable,
                        )
                    else {
                        return;
                    };
                    if crate::infra::os::elevated_pty::validate_elevated_shell(
                        &resolved,
                        &profile.args,
                    )
                    .is_err()
                    {
                        return;
                    }
                    profile.executable = resolved;
                }
                let cwd = std::env::var("USERPROFILE").ok();
                let Ok(spawned) = spawn_pty(
                    PtySpawnConfig {
                        profile: &profile,
                        tab_id: "__prewarm__",
                        host_id: "local",
                        ssh_key_id: None,
                        is_admin,
                        cols: initial_cols,
                        rows: initial_rows,
                        cwd: cwd.as_deref(),
                        extra_env: &[],
                        askpass_bridge: None,
                    },
                    &manager.job_supervisor,
                ) else {
                    return;
                };

                if manager.prewarm_cancelled.load(Ordering::SeqCst) {
                    spawned.session.manual_disconnect.store(true, Ordering::SeqCst);
                    spawned.session.terminate();
                    return;
                }

                let session = spawned.session;
                let mut reader = spawned.reader;
                let sink = Arc::new(Mutex::new(PrewarmSink::Buffering(Vec::with_capacity(4096))));
                let attached: Arc<Mutex<Option<AttachedTabTarget>>> = Arc::new(Mutex::new(None));

                let prewarmed = PrewarmedLocalSession {
                    profile,
                    session: session.clone(),
                    pid: spawned.pid,
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
                                            if tx.blocking_send(slice.to_vec()).is_err() {
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
                                    connect_failed_reason: None,
                                },
                            );
                        }
                    });
            });
    }

    pub(super) fn try_claim_prewarmed_local(
        &self,
        app: &AppHandle,
        req: &SessionConnectRequestDto,
        profile: &ShellProfile,
        is_admin: bool,
        on_output: &Channel<Vec<u8>>,
    ) -> Option<SessionConnectAckDto> {
        let taken = {
            let mut guard = self.prewarmed_local.lock().ok()?;
            let matches = guard
                .as_ref()
                .is_some_and(|p| p.is_admin == is_admin && profile_matches(&p.profile, profile));
            if !matches {
                return None;
            }
            self.prewarm_cancelled.store(true, Ordering::SeqCst);
            guard.take()
        }?;

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

        if !buffered.is_empty() {
            let _ = tx.blocking_send(buffered);
        }

        let target_cols = req.cols.max(MIN_PTY_COLS);
        let target_rows = req.rows.max(MIN_PTY_ROWS);
        if target_cols != taken.initial_cols || target_rows != taken.initial_rows {
            let _ = taken.session.resize(target_cols, target_rows);
        }

        Some(SessionConnectAckDto {
            tab_id: req.tab_id.clone(),
            host_id: "local".to_string(),
            pid: taken.pid,
            cli_preview: profile.name.clone(),
            status: "ONLINE".to_string(),
            is_admin: taken.is_admin,
            shell_profile: Some(profile.clone()),
        })
    }
}
