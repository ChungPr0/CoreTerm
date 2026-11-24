use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

use zeroize::Zeroizing;

use crate::core::defaults::{MIN_PTY_COLS, MIN_PTY_ROWS};
use crate::core::error::{CoreError, CoreResult};
use crate::infra::os::JobObjectSupervisor;
use crate::ipc::dto::ShellProfile;

use super::types::{AskpassSessionBridge, ExitStatusSlot, PtyBackend, PtySession};

pub(super) struct PtySpawnConfig<'a> {
    pub profile: &'a ShellProfile,
    pub tab_id: &'a str,
    pub host_id: &'a str,
    pub ssh_key_id: Option<String>,
    pub is_admin: bool,
    pub cols: u16,
    pub rows: u16,
    pub cwd: Option<&'a str>,
    pub extra_env: &'a [(String, Zeroizing<String>)],
    pub askpass_bridge: Option<Arc<AskpassSessionBridge>>,
}

pub(super) struct SpawnedPty {
    pub session: Arc<PtySession>,
    pub reader: Box<dyn Read + Send>,
    pub pid: Option<u32>,
}

pub(super) fn build_pty_command(
    profile: &ShellProfile,
    cwd: Option<&str>,
    extra_env: &[(String, Zeroizing<String>)],
) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(&profile.executable);
    for arg in &profile.args {
        cmd.arg(arg);
    }
    if let Some(dir) = cwd.filter(|d| !d.trim().is_empty()) {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    for (k, v) in extra_env {
        cmd.env(k, v.as_str());
    }
    cmd
}

/// Spawns any `ShellProfile` (local shell or SSH) into a unified ConPTY session.
pub(super) fn spawn_pty(
    cfg: PtySpawnConfig<'_>,
    job_supervisor: &JobObjectSupervisor,
) -> CoreResult<SpawnedPty> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: cfg.rows.max(MIN_PTY_ROWS),
            cols: cfg.cols.max(MIN_PTY_COLS),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| CoreError::Pty(format!("Failed to open Windows ConPTY: {e}")))?;

    let cmd = build_pty_command(cfg.profile, cfg.cwd, cfg.extra_env);
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| CoreError::Pty(format!("Failed to spawn process: {e}")))?;
    drop(pair.slave);

    let pid = child.process_id();
    if let Some(process_id) = pid {
        let _ = job_supervisor.assign_pid(process_id);
    }

    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            let _ = child.kill();
            return Err(CoreError::Pty(format!(
                "Failed to take ConPTY master writer: {e}"
            )));
        }
    };
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            let _ = child.kill();
            return Err(CoreError::Pty(format!(
                "Failed to clone ConPTY master reader: {e}"
            )));
        }
    };

    let killer = child.clone_killer();
    let exit_slot = Arc::new(ExitStatusSlot::new());

    let session = Arc::new(PtySession {
        tab_id: Mutex::new(cfg.tab_id.to_string()),
        host_id: cfg.host_id.to_string(),
        ssh_key_id: cfg.ssh_key_id,
        is_admin: cfg.is_admin,
        backend: PtyBackend::Direct {
            master: Mutex::new(Some(pair.master)),
            writer: Mutex::new(Some(writer)),
            killer: Mutex::new(killer),
            exit_slot: Arc::clone(&exit_slot),
        },
        askpass_bridge: cfg.askpass_bridge,
        askpass_server: Mutex::new(None),
        manual_disconnect: AtomicBool::new(false),
    });

    let waiter_session = Arc::clone(&session);
    let _ = std::thread::Builder::new()
        .name(format!("conpty-waiter-{}", cfg.tab_id))
        .spawn(move || {
            let code = child.wait().ok().map(|status| status.exit_code());
            if let Ok(mut guard) = exit_slot.lock.lock() {
                *guard = Some(code);
                exit_slot.cv.notify_all();
            }
            if !waiter_session.manual_disconnect.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(30));
            }
            waiter_session.close_pty_handles();
        });

    Ok(SpawnedPty {
        session,
        reader,
        pid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn conpty_reader_hits_eof_and_captures_exit_code_after_child_exits() {
        let supervisor = JobObjectSupervisor::new().unwrap();
        let profile = ShellProfile {
            id: "cmd".to_string(),
            kind: "cmd".to_string(),
            name: "CMD".to_string(),
            executable: "cmd.exe".to_string(),
            args: vec![
                "/c".to_string(),
                "echo".to_string(),
                "timed-out-sim".to_string(),
                "&".to_string(),
                "exit".to_string(),
                "255".to_string(),
            ],
        };
        let spawned = spawn_pty(
            PtySpawnConfig {
                profile: &profile,
                tab_id: "test-eof",
                host_id: "test-host",
                ssh_key_id: None,
                is_admin: false,
                cols: 80,
                rows: 24,
                cwd: None,
                extra_env: &[],
                askpass_bridge: None,
            },
            &supervisor,
        )
        .unwrap();

        let (tx, rx) = std::sync::mpsc::channel();
        let mut reader = spawned.reader;
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let res = reader.read_to_end(&mut buf);
            let _ = tx.send((res.is_ok(), String::from_utf8_lossy(&buf).into_owned()));
        });

        let (read_ok, output) = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("ConPTY reader should reach EOF promptly after child process exits");
        assert!(read_ok);
        assert!(output.contains("timed-out-sim"), "output was: {output:?}");
        assert_eq!(spawned.session.wait_exit_code(), Some(255));
    }
}
