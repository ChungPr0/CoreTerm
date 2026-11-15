use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;
use tauri::AppHandle;
use tracing::{error, info};

use crate::core::error::{CoreError, CoreResult};
use crate::hosts::HostService;
use crate::ipc::dto::{SessionConnectAckDto, SessionConnectRequestDto};
use crate::keys::KeyService;
use crate::pty::expect::ExpectStateMachine;

use super::events::{
    emit_status, finalize_reader_exit, spawn_output_batcher, ReaderExitCtx, ReaderExitMeta,
};
use super::manager::PtySessionManager;
use super::prewarm::build_local_powershell_command;
use super::ssh::{handle_expect_signal, SshExpectContext, SshLaunchPlan};
use super::types::{PtyBackend, PtySession, READ_BUF_SIZE};

pub(super) struct DirectLaunchSpec {
    pub req: SessionConnectRequestDto,
    pub is_local: bool,
    pub is_admin: bool,
    pub ssh_plan: Option<SshLaunchPlan>,
}

struct DirectReaderSpec {
    tab_id: String,
    host_id: String,
    is_local: bool,
    target_host: String,
    target_port: u16,
    host_pw_mode: String,
}

struct PtyServiceDeps<'a> {
    hosts: &'a HostService,
    keys: &'a KeyService,
}

impl PtySessionManager {
    pub(super) fn spawn_direct_session(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        keys: &KeyService,
        spec: DirectLaunchSpec,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<SessionConnectAckDto> {
        let tab_id = spec.req.tab_id;
        let host_id = spec.req.host_id;
        let ssh_plan = spec.ssh_plan;

        let active_forwards = ssh_plan
            .as_ref()
            .map(|p| p.active_forwards.clone())
            .unwrap_or_default();
        let cli_preview = ssh_plan
            .as_ref()
            .map(|p| p.cli_preview.clone())
            .unwrap_or_else(|| "powershell.exe".to_string());
        let ssh_key_id = ssh_plan.as_ref().and_then(|p| p.ssh_key_id.clone());
        let target_host = ssh_plan
            .as_ref()
            .map(|p| p.target_host.clone())
            .unwrap_or_default();
        let target_port = ssh_plan.as_ref().map(|p| p.target_port).unwrap_or(22);
        let host_pw_mode = ssh_plan
            .as_ref()
            .map(|p| p.host_pw_mode.clone())
            .unwrap_or_default();

        emit_status(
            app,
            &tab_id,
            &host_id,
            "CONNECTING",
            active_forwards.clone(),
            None,
        );

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: spec.req.rows.max(2),
                cols: spec.req.cols.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| CoreError::Pty(format!("Failed to open Windows ConPTY: {e}")))?;

        let cmd = match ssh_plan {
            None => build_local_powershell_command(),
            Some(plan) => {
                let mut c = CommandBuilder::new("ssh.exe");
                for arg in &plan.args {
                    c.arg(arg);
                }
                c.env("TERM", "xterm-256color");
                c.env("COLORTERM", "truecolor");
                c
            }
        };

        let child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                self.tunnel_registry.release_tab_tunnels(&tab_id);
                let err_msg = format!("Failed to spawn process: {e}");
                emit_status(app, &tab_id, &host_id, "ERROR", vec![], Some(err_msg.clone()));
                return Err(CoreError::Pty(err_msg));
            }
        };
        drop(pair.slave);

        let pid = child.process_id();
        if let Some(process_id) = pid {
            let _ = self.job_supervisor.assign_pid(process_id);
        }

        if !spec.is_local {
            let _ = hosts.touch_last_connected(&host_id);
        }

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| CoreError::Pty(format!("Failed to take ConPTY master writer: {e}")))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| CoreError::Pty(format!("Failed to clone ConPTY master reader: {e}")))?;

        let session = Arc::new(PtySession {
            tab_id: Mutex::new(tab_id.clone()),
            host_id: host_id.clone(),
            ssh_key_id,
            is_admin: spec.is_admin,
            backend: PtyBackend::Direct {
                master: Mutex::new(pair.master),
                writer: Mutex::new(writer),
                child: Mutex::new(child),
            },
            pending_prompt_type: Mutex::new(None),
            manual_disconnect: AtomicBool::new(false),
        });

        self.sessions.insert(tab_id.clone(), session.clone());
        emit_status(app, &tab_id, &host_id, "ONLINE", active_forwards, None);
        self.telemetry_hub.register_tab(app, hosts, &host_id, &tab_id);

        let reader_spec = DirectReaderSpec {
            tab_id: tab_id.clone(),
            host_id: host_id.clone(),
            is_local: spec.is_local,
            target_host,
            target_port,
            host_pw_mode,
        };
        self.spawn_direct_reader(
            app,
            PtyServiceDeps { hosts, keys },
            reader_spec,
            session,
            reader,
            on_output,
        )?;

        Ok(SessionConnectAckDto {
            tab_id,
            host_id,
            pid,
            cli_preview,
            status: "ONLINE".to_string(),
            is_admin: spec.is_admin,
        })
    }

    fn spawn_direct_reader(
        &self,
        app: &AppHandle,
        services: PtyServiceDeps<'_>,
        spec: DirectReaderSpec,
        session_ref: Arc<PtySession>,
        mut reader: Box<dyn Read + Send>,
        on_output: Channel<Vec<u8>>,
    ) -> CoreResult<()> {
        let (tx, batcher_handle) = spawn_output_batcher(on_output.clone());
        let sessions_map = self.sessions.clone();
        let tunnel_reg = self.tunnel_registry.clone();
        let telemetry_hub = self.telemetry_hub.clone();
        let app_handle = app.clone();
        let hosts = services.hosts.clone();
        let keys = services.keys.clone();
        let reader_tab_id = spec.tab_id;

        std::thread::Builder::new()
            .name(format!("conpty-reader-{reader_tab_id}"))
            .spawn(move || {
                let mut buf = [0u8; READ_BUF_SIZE];
                let mut expect = ExpectStateMachine::new();
                // Keep AUTH_FAILED final state intact when ssh.exe exits with code 255.
                let mut auth_failed_reason: Option<String> = None;

                let expect_ctx = SshExpectContext {
                    app: &app_handle,
                    hosts: &hosts,
                    keys: &keys,
                    session: &session_ref,
                    tab_id: &reader_tab_id,
                    host_id: &spec.host_id,
                    target_host: &spec.target_host,
                    target_port: spec.target_port,
                    host_pw_mode: &spec.host_pw_mode,
                };

                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => {
                            info!("ConPTY EOF reached for tab {reader_tab_id}");
                            break;
                        }
                        Ok(n) => {
                            let slice = &buf[..n];
                            if !spec.is_local {
                                let signal = expect.feed(slice);
                                handle_expect_signal(
                                    signal,
                                    &expect_ctx,
                                    &mut auth_failed_reason,
                                );
                            }
                            if tx.send(slice.to_vec()).is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            error!("ConPTY read error on tab {reader_tab_id}: {e}");
                            break;
                        }
                    }
                }

                drop(tx);
                let _ = tauri::async_runtime::block_on(batcher_handle);

                let was_manual = session_ref.manual_disconnect.load(Ordering::SeqCst);
                let exit_code = session_ref.wait_exit_code();

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
                        host_id: spec.host_id,
                        was_manual,
                        exit_code,
                        auth_failed_reason,
                    },
                );
            })
            .map_err(|e| CoreError::Pty(format!("Failed to spawn ConPTY reader thread: {e}")))?;

        Ok(())
    }
}
