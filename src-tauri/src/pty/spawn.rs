use std::io::Read;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

use crate::core::error::{CoreError, CoreResult};
use crate::infra::os::JobObjectSupervisor;
use crate::ipc::dto::ShellProfile;

use super::types::{PtyBackend, PtySession};

pub(super) struct PtySpawnConfig<'a> {
    pub profile: &'a ShellProfile,
    pub tab_id: &'a str,
    pub host_id: &'a str,
    pub ssh_key_id: Option<String>,
    pub is_admin: bool,
    pub cols: u16,
    pub rows: u16,
    pub cwd: Option<&'a str>,
}

pub(super) struct SpawnedPty {
    pub session: Arc<PtySession>,
    pub reader: Box<dyn Read + Send>,
    pub pid: Option<u32>,
}

pub(super) fn build_pty_command(profile: &ShellProfile, cwd: Option<&str>) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(&profile.executable);
    for arg in &profile.args {
        cmd.arg(arg);
    }
    if let Some(dir) = cwd.filter(|d| !d.trim().is_empty()) {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
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
            rows: cfg.rows.max(2),
            cols: cfg.cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| CoreError::Pty(format!("Failed to open Windows ConPTY: {e}")))?;

    let cmd = build_pty_command(cfg.profile, cfg.cwd);
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

    let session = Arc::new(PtySession {
        tab_id: Mutex::new(cfg.tab_id.to_string()),
        host_id: cfg.host_id.to_string(),
        ssh_key_id: cfg.ssh_key_id,
        is_admin: cfg.is_admin,
        backend: PtyBackend::Direct {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        },
        pending_prompt_type: Mutex::new(None),
        manual_disconnect: AtomicBool::new(false),
    });

    Ok(SpawnedPty {
        session,
        reader,
        pid,
    })
}
