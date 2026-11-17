use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use dashmap::DashMap;
use portable_pty::{ChildKiller, MasterPty, PtySize};
use tauri::ipc::Channel;
use tauri::AppHandle;

use crate::core::defaults::{MIN_PTY_COLS, MIN_PTY_ROWS};
use crate::core::error::{CoreError, CoreResult};
use crate::infra::os::elevated_pty;

pub(super) const READ_BUF_SIZE: usize = 16 * 1024;
pub(super) const MAX_BATCH_SIZE: usize = 32 * 1024;
pub(super) const BATCH_WINDOW_MS: u64 = 10;
pub(super) const PREWARM_BUFFER_LIMIT: usize = 256 * 1024;

pub(super) enum PrewarmSink {
    Buffering(Vec<u8>),
    Streaming(tokio::sync::mpsc::UnboundedSender<Vec<u8>>),
    Closed,
}

pub(super) struct AttachedTabTarget {
    pub app: AppHandle,
    pub tab_id: String,
    pub on_output: Channel<Vec<u8>>,
    pub batcher_handle: tauri::async_runtime::JoinHandle<()>,
}

pub(super) struct PrewarmedLocalSession {
    pub profile: crate::ipc::dto::ShellProfile,
    pub session: Arc<PtySession>,
    pub pid: Option<u32>,
    pub is_admin: bool,
    pub initial_cols: u16,
    pub initial_rows: u16,
    pub sink: Arc<Mutex<PrewarmSink>>,
    pub attached: Arc<Mutex<Option<AttachedTabTarget>>>,
}

pub(super) struct ExitStatusSlot {
    pub lock: Mutex<Option<Option<u32>>>,
    pub cv: Condvar,
}

impl ExitStatusSlot {
    pub fn new() -> Self {
        Self {
            lock: Mutex::new(None),
            cv: Condvar::new(),
        }
    }
}

pub(super) enum PtyBackend {
    Direct {
        master: Mutex<Option<Box<dyn MasterPty + Send>>>,
        writer: Mutex<Option<Box<dyn Write + Send>>>,
        killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
        exit_slot: Arc<ExitStatusSlot>,
    },
    #[cfg(windows)]
    Elevated {
        pipe_writer: Mutex<elevated_pty::PipeWriter>,
        pipe_out: Arc<elevated_pty::OverlappedPipe>,
    },
}

pub struct PtySession {
    pub(super) tab_id: Mutex<String>,
    pub host_id: String,
    pub ssh_key_id: Option<String>,
    pub is_admin: bool,
    pub(super) backend: PtyBackend,
    pub(super) pending_prompt_type: Mutex<Option<String>>,
    pub(super) manual_disconnect: AtomicBool,
}

impl PtySession {
    pub(super) fn tab_id(&self) -> String {
        self.tab_id
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub(super) fn set_tab_id(&self, next_tab_id: &str) {
        if let Ok(mut g) = self.tab_id.lock() {
            *g = next_tab_id.to_string();
        }
    }

    pub(super) fn write_bytes(&self, data: &[u8]) -> CoreResult<()> {
        match &self.backend {
            PtyBackend::Direct { writer, .. } => {
                let mut guard = writer
                    .lock()
                    .map_err(|e| CoreError::Internal(format!("PTY writer mutex poisoned: {e}")))?;
                let Some(ref mut w) = *guard else {
                    return Err(CoreError::Pty("PTY session is closed".to_string()));
                };
                w.write_all(data)?;
                w.flush()?;
                Ok(())
            }
            #[cfg(windows)]
            PtyBackend::Elevated { pipe_writer, .. } => {
                let mut w = pipe_writer
                    .lock()
                    .map_err(|e| CoreError::Internal(format!("Elevated pipe mutex poisoned: {e}")))?;
                elevated_pty::write_frame(&mut *w, elevated_pty::FRAME_DATA, data)?;
                Ok(())
            }
        }
    }

    pub(super) fn resize(&self, cols: u16, rows: u16) -> CoreResult<()> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        match &self.backend {
            PtyBackend::Direct { master, .. } => {
                let guard = master
                    .lock()
                    .map_err(|e| CoreError::Internal(format!("PTY master mutex poisoned: {e}")))?;
                let Some(ref m) = *guard else {
                    return Ok(());
                };
                m.resize(PtySize {
                    rows: rows.max(MIN_PTY_ROWS),
                    cols: cols.max(MIN_PTY_COLS),
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| CoreError::Pty(format!("Failed to resize ConPTY: {e}")))?;
                Ok(())
            }
            #[cfg(windows)]
            PtyBackend::Elevated { pipe_writer, .. } => {
                let mut w = pipe_writer
                    .lock()
                    .map_err(|e| CoreError::Internal(format!("Elevated pipe mutex poisoned: {e}")))?;
                let mut payload = [0u8; 4];
                payload[0..2].copy_from_slice(&cols.to_le_bytes());
                payload[2..4].copy_from_slice(&rows.to_le_bytes());
                elevated_pty::write_frame(&mut *w, elevated_pty::FRAME_RESIZE, &payload)?;
                Ok(())
            }
        }
    }

    /// Drops ConPTY master/writer handles so Windows ConPTY flushes and signals pipe EOF cleanly.
    pub(super) fn close_pty_handles(&self) {
        if let PtyBackend::Direct { master, writer, .. } = &self.backend {
            if let Ok(mut w) = writer.lock() {
                drop(w.take());
            }
            if let Ok(mut m) = master.lock() {
                drop(m.take());
            }
        }
    }

    pub(super) fn terminate(&self) {
        match &self.backend {
            PtyBackend::Direct { killer, .. } => {
                if let Ok(mut k) = killer.lock() {
                    let _ = k.kill();
                }
                self.close_pty_handles();
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

    pub(super) fn wait_exit_code(&self) -> Option<u32> {
        match &self.backend {
            PtyBackend::Direct { exit_slot, .. } => {
                let guard = exit_slot.lock.lock().ok()?;
                if let Some(code) = *guard {
                    return code;
                }
                let (guard, _) = exit_slot
                    .cv
                    .wait_timeout_while(guard, Duration::from_secs(2), |state| state.is_none())
                    .ok()?;
                guard.flatten()
            }
            #[cfg(windows)]
            PtyBackend::Elevated { .. } => None,
        }
    }
}

pub(super) struct InFlightConnectGuard {
    pub map: Arc<DashMap<String, ()>>,
    pub tab_id: String,
}

impl Drop for InFlightConnectGuard {
    fn drop(&mut self) {
        self.map.remove(&self.tab_id);
    }
}
