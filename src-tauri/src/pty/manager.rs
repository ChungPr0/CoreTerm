use std::collections::HashSet;
use std::io::{Read, Write};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dashmap::DashMap;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tracing::{error, info, warn};
use zeroize::Zeroizing;

use crate::db::Database;
use crate::ipc::dto::{
    PortForwardStatusDto, PortProbeResultDto, SessionAuthPromptEventDto, SessionConnectAckDto,
    SessionHostKeyPromptEventDto, SessionStatusEventDto,
};
use crate::ipc::error::{AppError, AppResult};
use crate::os::{elevated_pty, is_process_elevated, JobObjectSupervisor};
use crate::pty::expect::{ExpectSignal, ExpectStateMachine};
use crate::ssh::{ActiveTunnelRegistry, SshCommandCompiler};
use crate::telemetry::TelemetryHub;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const READ_BUF_SIZE: usize = 16 * 1024;
const MAX_BATCH_SIZE: usize = 32 * 1024;
const BATCH_WINDOW_MS: u64 = 10;

enum PtyBackend {
    Direct {
        master: Mutex<Box<dyn MasterPty + Send>>,
        writer: Mutex<Box<dyn Write + Send>>,
        child: Mutex<Box<dyn Child + Send + Sync>>,
    },
    #[cfg(windows)]
    Elevated {
        pipe_writer: Mutex<elevated_pty::PipeWriter>,
        pipe_out: Arc<elevated_pty::OverlappedPipe>,
    },
}

pub struct PtySession {
    pub tab_id: String,
    pub host_id: String,
    pub ssh_key_id: Option<String>,
    pub pid: Option<u32>,
    pub is_admin: bool,
    backend: PtyBackend,
    pending_prompt_type: Mutex<Option<String>>,
    manual_disconnect: AtomicBool,
}

impl PtySession {
    fn write_bytes(&self, data: &[u8]) -> AppResult<()> {
        match &self.backend {
            PtyBackend::Direct { writer, .. } => {
                let mut w = writer
                    .lock()
                    .map_err(|e| AppError::Internal(format!("PTY writer mutex poisoned: {e}")))?;
                w.write_all(data)?;
                w.flush()?;
                Ok(())
            }
            #[cfg(windows)]
            PtyBackend::Elevated { pipe_writer, .. } => {
                let mut w = pipe_writer
                    .lock()
                    .map_err(|e| AppError::Internal(format!("Elevated pipe mutex poisoned: {e}")))?;
                elevated_pty::write_frame(&mut *w, elevated_pty::FRAME_DATA, data)?;
                Ok(())
            }
        }
    }

    fn resize(&self, cols: u16, rows: u16) -> AppResult<()> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        match &self.backend {
            PtyBackend::Direct { master, .. } => {
                let m = master
                    .lock()
                    .map_err(|e| AppError::Internal(format!("PTY master mutex poisoned: {e}")))?;
                m.resize(PtySize {
                    rows: rows.max(2),
                    cols: cols.max(10),
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| AppError::Pty(format!("Failed to resize ConPTY: {e}")))?;
                Ok(())
            }
            #[cfg(windows)]
            PtyBackend::Elevated { pipe_writer, .. } => {
                let mut w = pipe_writer
                    .lock()
                    .map_err(|e| AppError::Internal(format!("Elevated pipe mutex poisoned: {e}")))?;
                let mut payload = [0u8; 4];
                payload[0..2].copy_from_slice(&cols.to_le_bytes());
                payload[2..4].copy_from_slice(&rows.to_le_bytes());
                elevated_pty::write_frame(&mut *w, elevated_pty::FRAME_RESIZE, &payload)?;
                Ok(())
            }
        }
    }

    fn terminate(&self) {
        match &self.backend {
            PtyBackend::Direct { child, .. } => {
                if let Ok(mut c) = child.lock() {
                    let _ = c.kill();
                }
            }
            #[cfg(windows)]
            PtyBackend::Elevated {
                pipe_writer,
                pipe_out,
            } => {
                if let Ok(mut w) = pipe_writer.lock() {
                    let _ = elevated_pty::write_frame(&mut *w, elevated_pty::FRAME_CLOSE, &[]);
                }
                pipe_out.cancel();
            }
        }
    }
}

struct InFlightConnectGuard {
    map: Arc<DashMap<String, ()>>,
    tab_id: String,
}

impl Drop for InFlightConnectGuard {
    fn drop(&mut self) {
        self.map.remove(&self.tab_id);
    }
}

#[derive(Clone)]
pub struct PtySessionManager {
    sessions: Arc<DashMap<String, Arc<PtySession>>>,
    in_flight_connects: Arc<DashMap<String, ()>>,
    tab_host_map: Arc<DashMap<String, String>>,
    tab_admin_map: Arc<DashMap<String, bool>>,
    tunnel_registry: ActiveTunnelRegistry,
    telemetry_hub: TelemetryHub,
    job_supervisor: JobObjectSupervisor,
}

impl PtySessionManager {
    pub fn new(job_supervisor: JobObjectSupervisor) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            in_flight_connects: Arc::new(DashMap::new()),
            tab_host_map: Arc::new(DashMap::new()),
            tab_admin_map: Arc::new(DashMap::new()),
            tunnel_registry: ActiveTunnelRegistry::new(),
            telemetry_hub: TelemetryHub::new(job_supervisor.clone()),
            job_supervisor,
        }
    }

    pub fn tunnel_registry(&self) -> &ActiveTunnelRegistry {
        &self.tunnel_registry
    }

    pub fn probe_host_ports(
        &self,
        db: &Database,
        host_id: &str,
    ) -> AppResult<Vec<PortProbeResultDto>> {
        let rules = db.port_forward_list(host_id)?;
        Ok(self.tunnel_registry.probe_host_rules(host_id, &rules))
    }

    fn emit_status(
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

    fn emit_auth_prompt(
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

    fn emit_host_key_prompt(app: &AppHandle, payload: SessionHostKeyPromptEventDto) {
        let _ = app.emit("session:host_key_prompt", payload);
    }

    fn spawn_output_batcher(
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

    #[allow(clippy::too_many_arguments)]
    fn finalize_reader_exit(
        sessions_map: &DashMap<String, Arc<PtySession>>,
        tunnel_reg: &ActiveTunnelRegistry,
        telemetry_hub: &TelemetryHub,
        app_handle: &AppHandle,
        on_output: &Channel<Vec<u8>>,
        session_ref: &Arc<PtySession>,
        reader_tab_id: &str,
        reader_host_id: &str,
        was_manual: bool,
        exit_code: Option<u32>,
        auth_failed_reason: Option<String>,
    ) {
        let removed =
            sessions_map.remove_if(reader_tab_id, |_, current| Arc::ptr_eq(current, session_ref));
        if removed.is_some() {
            tunnel_reg.release_tab_tunnels(reader_tab_id);
            telemetry_hub.release_tab(reader_tab_id);
        }

        if !was_manual {
            let (final_state, err_msg) = if let Some(reason) = auth_failed_reason {
                ("AUTH_FAILED", Some(reason))
            } else {
                match exit_code {
                    Some(0) | None => ("DISCONNECTED", None),
                    Some(code) => ("ERROR", Some(format!("Process exited with code {code}"))),
                }
            };

            let exit_banner = match exit_code {
                Some(0) | None => "\r\n\x1b[90m[Session closed.]\x1b[0m\r\n".to_string(),
                Some(code) => format!("\r\n\x1b[31m[Process exited with code {code}.]\x1b[0m\r\n"),
            };
            let _ = on_output.send(exit_banner.into_bytes());

            Self::emit_status(
                app_handle,
                reader_tab_id,
                reader_host_id,
                final_state,
                vec![],
                err_msg,
            );
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn connect(
        &self,
        app: &AppHandle,
        db: &Database,
        tab_id: String,
        host_id: String,
        cols: u16,
        rows: u16,
        conflict_strategy: Option<String>,
        as_admin: Option<bool>,
        on_output: Channel<Vec<u8>>,
    ) -> AppResult<SessionConnectAckDto> {
        let _connect_guard = {
            use dashmap::mapref::entry::Entry;
            match self.in_flight_connects.entry(tab_id.clone()) {
                Entry::Occupied(_) => {
                    return Err(AppError::Pty(
                        "Tab connection is already in progress".to_string(),
                    ));
                }
                Entry::Vacant(slot) => {
                    slot.insert(());
                    InFlightConnectGuard {
                        map: self.in_flight_connects.clone(),
                        tab_id: tab_id.clone(),
                    }
                }
            }
        };

        if self.sessions.contains_key(&tab_id) {
            let _ = self.disconnect(app, &tab_id);
        }

        self.tab_host_map.insert(tab_id.clone(), host_id.clone());

        let is_local = host_id == "local";
        let app_elevated = is_process_elevated();
        let is_admin = is_local && (app_elevated || as_admin.unwrap_or(false));
        self.tab_admin_map.insert(tab_id.clone(), is_admin);

        // When parent app is unelevated and user asks for an Admin terminal tab, use UAC helper bridge.
        if is_admin && !app_elevated {
            return self.connect_elevated_local(app, db, tab_id, host_id, cols, rows, on_output);
        }

        let mut active_forwards = Vec::new();
        let mut cli_preview = "powershell.exe".to_string();
        let mut ssh_key_id = None;
        let mut target_host = String::new();
        let mut target_port = 22u16;
        let mut host_pw_mode = String::new();
        let mut ssh_args = Vec::new();

        if !is_local {
            let config = db.host_get_detail(&host_id)?;
            let strategy = conflict_strategy
                .as_deref()
                .unwrap_or("AUTO_SHARE_OR_SKIP");

            let probe_results = self
                .tunnel_registry
                .probe_host_rules(&host_id, &config.port_forwards);
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
                        Self::emit_status(
                            app,
                            &tab_id,
                            &host_id,
                            "PORT_CONFLICT",
                            vec![],
                            Some(msg.clone()),
                        );
                        return Err(AppError::Validation(msg));
                    }
                    skipped_rule_ids.insert(p.rule_id.clone());
                }
            }

            ssh_args =
                SshCommandCompiler::compile_args_with_skipped_rules(&config, &skipped_rule_ids)?;
            let preview =
                SshCommandCompiler::preview_command_with_skipped_rules(&config, &skipped_rule_ids)?;
            cli_preview = preview.cli_string;
            active_forwards = self.tunnel_registry.build_session_forward_statuses(
                &tab_id,
                &host_id,
                &config.port_forwards,
                &skipped_rule_ids,
            );
            ssh_key_id = config.ssh_key_id;
            target_host = config.host;
            target_port = config.port;
            host_pw_mode = config.password_mode;
        }

        Self::emit_status(
            app,
            &tab_id,
            &host_id,
            "CONNECTING",
            active_forwards.clone(),
            None,
        );

        let pty_system = native_pty_system();
        let pty_size = PtySize {
            rows: rows.max(2),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(pty_size)
            .map_err(|e| AppError::Pty(format!("Failed to open Windows ConPTY: {e}")))?;

        let mut cmd = if is_local {
            let mut c = CommandBuilder::new("powershell.exe");
            c.arg("-NoLogo");
            if let Ok(home) = std::env::var("USERPROFILE") {
                c.cwd(home);
            }
            c
        } else {
            let mut c = CommandBuilder::new("ssh.exe");
            for arg in &ssh_args {
                c.arg(arg);
            }
            c
        };
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                self.tunnel_registry.release_tab_tunnels(&tab_id);
                let err_msg = format!("Failed to spawn process: {e}");
                Self::emit_status(
                    app,
                    &tab_id,
                    &host_id,
                    "ERROR",
                    vec![],
                    Some(err_msg.clone()),
                );
                return Err(AppError::Pty(err_msg));
            }
        };

        drop(pair.slave);

        let pid = child.process_id();
        if let Some(process_id) = pid {
            let _ = self.job_supervisor.assign_pid(process_id);
        }

        if !is_local {
            let _ = db.host_touch_last_connected(&host_id);
        }

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Pty(format!("Failed to take ConPTY master writer: {e}")))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Pty(format!("Failed to clone ConPTY master reader: {e}")))?;

        let session = Arc::new(PtySession {
            tab_id: tab_id.clone(),
            host_id: host_id.clone(),
            ssh_key_id,
            pid,
            is_admin,
            backend: PtyBackend::Direct {
                master: Mutex::new(pair.master),
                writer: Mutex::new(writer),
                child: Mutex::new(child),
            },
            pending_prompt_type: Mutex::new(None),
            manual_disconnect: AtomicBool::new(false),
        });

        self.sessions.insert(tab_id.clone(), session.clone());

        Self::emit_status(
            app,
            &tab_id,
            &host_id,
            "ONLINE",
            active_forwards.clone(),
            None,
        );

        self.telemetry_hub.register_tab(app, db, &host_id, &tab_id);

        let (tx, batcher_handle) = Self::spawn_output_batcher(on_output.clone());

        let sessions_map = self.sessions.clone();
        let tunnel_reg = self.tunnel_registry.clone();
        let telemetry_hub = self.telemetry_hub.clone();
        let app_handle = app.clone();
        let db_clone = db.clone();
        let reader_tab_id = tab_id.clone();
        let reader_host_id = host_id.clone();
        let session_ref = session.clone();

        std::thread::Builder::new()
            .name(format!("conpty-reader-{reader_tab_id}"))
            .spawn(move || {
                let mut buf = [0u8; READ_BUF_SIZE];
                let mut expect = ExpectStateMachine::new();
                // Keep AUTH_FAILED final state intact when ssh.exe exits with code 255.
                let mut auth_failed_reason: Option<String> = None;

                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => {
                            info!("ConPTY EOF reached for tab {reader_tab_id}");
                            break;
                        }
                        Ok(n) => {
                            let slice = &buf[..n];

                            if !is_local {
                                match expect.feed(slice) {
                                    ExpectSignal::None => {}
                                    ExpectSignal::PasswordPrompt {
                                        prompt_text,
                                        attempt,
                                    } => {
                                        let mut auto_filled = false;
                                        if attempt == 1 && host_pw_mode == "SAVED" {
                                            if let Ok(Some(secret)) =
                                                db_clone.get_host_secret(&reader_host_id)
                                            {
                                                let line = Zeroizing::new(format!(
                                                    "{}\r\n",
                                                    secret.as_str()
                                                ));
                                                if session_ref.write_bytes(line.as_bytes()).is_ok()
                                                {
                                                    auto_filled = true;
                                                }
                                            }
                                        }
                                        if !auto_filled {
                                            if let Ok(mut p) =
                                                session_ref.pending_prompt_type.lock()
                                            {
                                                *p = Some("PASSWORD".to_string());
                                            }
                                            Self::emit_auth_prompt(
                                                &app_handle,
                                                &reader_tab_id,
                                                &reader_host_id,
                                                "PASSWORD",
                                                prompt_text,
                                                attempt,
                                            );
                                        }
                                    }
                                    ExpectSignal::PassphrasePrompt {
                                        prompt_text,
                                        attempt,
                                    } => {
                                        let mut auto_filled = false;
                                        if attempt == 1 {
                                            if let Some(ref key_id) = session_ref.ssh_key_id {
                                                if let Ok(Some(secret)) =
                                                    db_clone.get_key_secret(key_id)
                                                {
                                                    let line = Zeroizing::new(format!(
                                                        "{}\r\n",
                                                        secret.as_str()
                                                    ));
                                                    if session_ref
                                                        .write_bytes(line.as_bytes())
                                                        .is_ok()
                                                    {
                                                        auto_filled = true;
                                                    }
                                                }
                                            }
                                        }
                                        if !auto_filled {
                                            if let Ok(mut p) =
                                                session_ref.pending_prompt_type.lock()
                                            {
                                                *p = Some("KEY_PASSPHRASE".to_string());
                                            }
                                            Self::emit_auth_prompt(
                                                &app_handle,
                                                &reader_tab_id,
                                                &reader_host_id,
                                                "KEY_PASSPHRASE",
                                                prompt_text,
                                                attempt,
                                            );
                                        }
                                    }
                                    ExpectSignal::HostKeyPrompt {
                                        algorithm,
                                        fingerprint,
                                        reason,
                                    } => {
                                        Self::emit_host_key_prompt(
                                            &app_handle,
                                            SessionHostKeyPromptEventDto {
                                                tab_id: reader_tab_id.clone(),
                                                host_id: reader_host_id.clone(),
                                                host: target_host.clone(),
                                                port: target_port,
                                                algorithm,
                                                fingerprint,
                                                reason,
                                            },
                                        );
                                    }
                                    ExpectSignal::AuthFailed { reason } => {
                                        auth_failed_reason = Some(reason.clone());
                                        Self::emit_status(
                                            &app_handle,
                                            &reader_tab_id,
                                            &reader_host_id,
                                            "AUTH_FAILED",
                                            vec![],
                                            Some(reason),
                                        );
                                    }
                                }
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
                let exit_code = match &session_ref.backend {
                    PtyBackend::Direct { child, .. } => child
                        .lock()
                        .ok()
                        .and_then(|mut c| c.wait().ok())
                        .map(|status| status.exit_code()),
                    #[cfg(windows)]
                    PtyBackend::Elevated { .. } => None,
                };

                Self::finalize_reader_exit(
                    &sessions_map,
                    &tunnel_reg,
                    &telemetry_hub,
                    &app_handle,
                    &on_output,
                    &session_ref,
                    &reader_tab_id,
                    &reader_host_id,
                    was_manual,
                    exit_code,
                    auth_failed_reason,
                );
            })
            .map_err(|e| AppError::Pty(format!("Failed to spawn ConPTY reader thread: {e}")))?;

        Ok(SessionConnectAckDto {
            tab_id,
            host_id,
            pid,
            cli_preview,
            status: "ONLINE".to_string(),
            is_admin,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn connect_elevated_local(
        &self,
        app: &AppHandle,
        db: &Database,
        tab_id: String,
        host_id: String,
        cols: u16,
        rows: u16,
        on_output: Channel<Vec<u8>>,
    ) -> AppResult<SessionConnectAckDto> {
        #[cfg(not(windows))]
        {
            let _ = (app, db, tab_id, host_id, cols, rows, on_output);
            return Err(AppError::Pty(
                "Elevated tabs are only supported on Windows".to_string(),
            ));
        }

        #[cfg(windows)]
        {
            Self::emit_status(app, &tab_id, &host_id, "CONNECTING", vec![], None);

            let conn = match elevated_pty::spawn_elevated_pty(cols, rows) {
                Ok(c) => c,
                Err(msg) => {
                    Self::emit_status(app, &tab_id, &host_id, "ERROR", vec![], Some(msg.clone()));
                    return Err(AppError::Pty(msg));
                }
            };

            let pipe_out = conn.pipe_out.clone();
            let mut pipe_reader = elevated_pty::PipeReader(conn.pipe_out);
            let pipe_writer = elevated_pty::PipeWriter(conn.pipe_in);

            let session = Arc::new(PtySession {
                tab_id: tab_id.clone(),
                host_id: host_id.clone(),
                ssh_key_id: None,
                pid: None,
                is_admin: true,
                backend: PtyBackend::Elevated {
                    pipe_writer: Mutex::new(pipe_writer),
                    pipe_out,
                },
                pending_prompt_type: Mutex::new(None),
                manual_disconnect: AtomicBool::new(false),
            });

            self.sessions.insert(tab_id.clone(), session.clone());
            Self::emit_status(app, &tab_id, &host_id, "ONLINE", vec![], None);
            self.telemetry_hub.register_tab(app, db, &host_id, &tab_id);

            let (tx, batcher_handle) = Self::spawn_output_batcher(on_output.clone());
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
                    Self::finalize_reader_exit(
                        &sessions_map,
                        &tunnel_reg,
                        &telemetry_hub,
                        &app_handle,
                        &on_output,
                        &session_ref,
                        &reader_tab_id,
                        &reader_host_id,
                        was_manual,
                        exit_code,
                        None,
                    );
                })
                .map_err(|e| {
                    AppError::Pty(format!("Failed to spawn elevated PTY reader thread: {e}"))
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

    pub fn write_stdin(&self, tab_id: &str, data: &[u8]) -> AppResult<()> {
        let session = self
            .sessions
            .get(tab_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("Active PTY session not found for tab {tab_id}"))
            })?
            .clone();

        session.write_bytes(data)
    }

    pub fn submit_secret(
        &self,
        db: &Database,
        tab_id: &str,
        secret: String,
        save_to_vault: bool,
    ) -> AppResult<()> {
        let zeroized_secret = Zeroizing::new(secret);
        let session = self
            .sessions
            .get(tab_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("Active PTY session not found for tab {tab_id}"))
            })?
            .clone();

        let prompt_type = session
            .pending_prompt_type
            .lock()
            .ok()
            .and_then(|mut g| g.take())
            .unwrap_or_else(|| "PASSWORD".to_string());

        if save_to_vault {
            if prompt_type == "KEY_PASSPHRASE" {
                if let Some(ref key_id) = session.ssh_key_id {
                    let _ = db.save_key_secret(key_id, &zeroized_secret);
                }
            } else {
                let _ = db.save_host_secret(&session.host_id, &zeroized_secret);
            }
        }

        let line = Zeroizing::new(format!("{}\r\n", zeroized_secret.as_str()));
        session.write_bytes(line.as_bytes())
    }

    /// Handles host key verification (`ACCEPT`, `REJECT`, or `REMOVE_OLD_AND_ACCEPT` via `ssh-keygen -R`).
    pub fn submit_host_key(
        &self,
        app: &AppHandle,
        db: &Database,
        tab_id: &str,
        action: &str,
    ) -> AppResult<()> {
        match action {
            "ACCEPT" => self.write_stdin(tab_id, b"yes\r\n"),
            "REJECT" => {
                let _ = self.write_stdin(tab_id, b"no\r\n");
                let _ = self.disconnect(app, tab_id);
                Ok(())
            }
            "REMOVE_OLD_AND_ACCEPT" => {
                let host_id = self
                    .tab_host_map
                    .get(tab_id)
                    .map(|v| v.value().clone())
                    .or_else(|| self.sessions.get(tab_id).map(|s| s.host_id.clone()))
                    .ok_or_else(|| {
                        AppError::NotFound(format!("No host found for tab {tab_id}"))
                    })?;

                let config = db.host_get_detail(&host_id)?;
                remove_host_from_known_hosts(&config.host, config.port);
                Ok(())
            }
            other => Err(AppError::Validation(format!(
                "Unsupported host key action: {other}"
            ))),
        }
    }

    pub fn resize_pty(&self, tab_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }

        let Some(session_entry) = self.sessions.get(tab_id) else {
            return Ok(());
        };
        let session = session_entry.clone();
        session.resize(cols, rows)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn reconnect(
        &self,
        app: &AppHandle,
        db: &Database,
        tab_id: String,
        host_id_override: Option<String>,
        cols: u16,
        rows: u16,
        as_admin_override: Option<bool>,
        on_output: Channel<Vec<u8>>,
    ) -> AppResult<SessionConnectAckDto> {
        let host_id = host_id_override
            .or_else(|| self.tab_host_map.get(&tab_id).map(|v| v.value().clone()))
            .or_else(|| self.sessions.get(&tab_id).map(|s| s.host_id.clone()))
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "Cannot reconnect tab {tab_id}: no associated host_id found"
                ))
            })?;

        let remembered_admin = as_admin_override
            .or_else(|| self.tab_admin_map.get(&tab_id).map(|v| *v.value()))
            .or_else(|| self.sessions.get(&tab_id).map(|s| s.is_admin));

        let _ = self.disconnect(app, &tab_id);
        self.connect(
            app,
            db,
            tab_id,
            host_id,
            cols,
            rows,
            None,
            remembered_admin,
            on_output,
        )
    }

    pub fn disconnect(&self, app: &AppHandle, tab_id: &str) -> AppResult<()> {
        self.tunnel_registry.release_tab_tunnels(tab_id);
        self.telemetry_hub.release_tab(tab_id);

        if let Some((_, session)) = self.sessions.remove(tab_id) {
            session.manual_disconnect.store(true, Ordering::SeqCst);
            session.terminate();
            Self::emit_status(
                app,
                &session.tab_id,
                &session.host_id,
                "DISCONNECTED",
                vec![],
                None,
            );
        }
        Ok(())
    }

    pub fn sync_host_telemetry(&self, app: &AppHandle, db: &Database, host_id: &str) {
        let enabled = db
            .host_get_detail(host_id)
            .map(|c| c.options.telemetry_enabled)
            .unwrap_or(false);

        let active_tabs: Vec<String> = self
            .sessions
            .iter()
            .filter(|entry| entry.value().host_id == host_id)
            .map(|entry| entry.key().clone())
            .collect();

        for tab_id in active_tabs {
            if enabled {
                self.telemetry_hub.register_tab(app, db, host_id, &tab_id);
            } else {
                self.telemetry_hub.release_tab(&tab_id);
            }
        }
    }

    pub fn sync_local_telemetry(
        &self,
        app: &AppHandle,
        db: &Database,
        enabled: bool,
        interval_sec: u16,
    ) {
        self.telemetry_hub.set_local_config(enabled, interval_sec);

        let active_local_tabs: Vec<String> = self
            .sessions
            .iter()
            .filter(|entry| entry.value().host_id == "local")
            .map(|entry| entry.key().clone())
            .collect();

        for tab_id in active_local_tabs {
            if enabled {
                self.telemetry_hub.register_tab(app, db, "local", &tab_id);
            } else {
                self.telemetry_hub.release_tab(&tab_id);
            }
        }
    }

    pub fn shutdown_all(&self) {
        self.telemetry_hub.shutdown_all();
        let keys: Vec<String> = self.sessions.iter().map(|e| e.key().clone()).collect();
        for tab_id in keys {
            self.tunnel_registry.release_tab_tunnels(&tab_id);
            if let Some((_, session)) = self.sessions.remove(&tab_id) {
                session.manual_disconnect.store(true, Ordering::SeqCst);
                session.terminate();
            }
        }
        info!("All ConPTY sessions and telemetry workers shut down.");
    }
}

/// Removes stale host key entries from `~/.ssh/known_hosts` via `ssh-keygen.exe -R`.
fn remove_host_from_known_hosts(host: &str, port: u16) {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return;
    }

    let mut cmd1 = Command::new("ssh-keygen.exe");
    cmd1.args(["-R", trimmed]);
    #[cfg(windows)]
    cmd1.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd1.output();

    if port != 22 {
        let bracketed = format!("[{trimmed}]:{port}");
        let mut cmd2 = Command::new("ssh-keygen.exe");
        cmd2.args(["-R", &bracketed]);
        #[cfg(windows)]
        cmd2.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd2.output();
    }
}
