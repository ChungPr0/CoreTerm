use std::io::Read;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::AppHandle;
use tracing::{error, info};

use crate::core::error::{CoreError, CoreResult};
use crate::hosts::HostService;
use crate::ipc::dto::{SessionConnectAckDto, SessionConnectRequestDto, ShellProfile};
use crate::keys::KeyService;
use crate::pty::expect::ExpectStateMachine;

use super::events::{
    emit_status, finalize_reader_exit, spawn_output_batcher, ReaderExitCtx, ReaderExitMeta,
};
use super::manager::PtySessionManager;
use super::shells::default_shell_profile;
use super::spawn::{spawn_pty, PtySpawnConfig};
use super::ssh::{handle_expect_signal, SshExpectContext, SshLaunchPlan};
use super::types::{PtySession, READ_BUF_SIZE};

pub(super) struct DirectLaunchSpec {
    pub req: SessionConnectRequestDto,
    pub is_local: bool,
    pub is_admin: bool,
    pub local_profile: Option<ShellProfile>,
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

        let (profile, cli_preview) = match ssh_plan {
            Some(ref plan) => {
                let ssh_profile = ShellProfile {
                    id: "ssh".to_string(),
                    kind: "ssh".to_string(),
                    name: plan.cli_preview.clone(),
                    executable: "ssh.exe".to_string(),
                    args: plan
                        .args
                        .iter()
                        .map(|a| a.to_string_lossy().into_owned())
                        .collect(),
                };
                (ssh_profile, plan.cli_preview.clone())
            }
            None => {
                let p = spec.local_profile.unwrap_or_else(default_shell_profile);
                let preview = p.name.clone();
                (p, preview)
            }
        };

        emit_status(
            app,
            &tab_id,
            &host_id,
            "CONNECTING",
            active_forwards.clone(),
            None,
        );

        let cwd = if spec.is_local {
            std::env::var("USERPROFILE").ok()
        } else {
            None
        };

        let spawned = match spawn_pty(
            PtySpawnConfig {
                profile: &profile,
                tab_id: &tab_id,
                host_id: &host_id,
                ssh_key_id,
                is_admin: spec.is_admin,
                cols: spec.req.cols,
                rows: spec.req.rows,
                cwd: cwd.as_deref(),
            },
            &self.job_supervisor,
        ) {
            Ok(s) => s,
            Err(err) => {
                self.tunnel_registry.release_tab_tunnels(&tab_id);
                emit_status(
                    app,
                    &tab_id,
                    &host_id,
                    "ERROR",
                    vec![],
                    Some(err.to_string()),
                );
                return Err(err);
            }
        };

        if !spec.is_local {
            let _ = hosts.touch_last_connected(&host_id);
        }

        let session = spawned.session;
        let pid = spawned.pid;
        let reader = spawned.reader;

        self.sessions.insert(tab_id.clone(), session.clone());
        emit_status(app, &tab_id, &host_id, "ONLINE", active_forwards, None);

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
            shell_profile: if spec.is_local { Some(profile) } else { None },
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
