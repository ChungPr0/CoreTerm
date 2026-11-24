use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::SyncSender;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use dashmap::DashMap;
use portable_pty::{ChildKiller, MasterPty, PtySize};
use tauri::ipc::Channel;
use tauri::AppHandle;

use crate::core::defaults::{MIN_PTY_COLS, MIN_PTY_ROWS};
use crate::core::error::{CoreError, CoreResult};
use crate::infra::os::elevated_pty;
use crate::infra::security::TabSecretKind;
use zeroize::Zeroizing;

use super::askpass::AskpassServerHandle;

pub(super) const READ_BUF_SIZE: usize = 16 * 1024;
pub(super) const MAX_BATCH_SIZE: usize = 32 * 1024;
pub(super) const BATCH_WINDOW_MS: u64 = 10;
pub(super) const PREWARM_BUFFER_LIMIT: usize = 256 * 1024;

pub(super) struct PendingAskpassSecret {
    pub prompt_type: String,
    pub is_reusable: bool,
    pub tx: SyncSender<Option<Zeroizing<String>>>,
}

pub(super) struct PendingAskpassHostKey {
    pub tx: SyncSender<Option<String>>,
}

pub(super) struct StagedSecret {
    pub kind: TabSecretKind,
    pub secret: Zeroizing<String>,
    pub save_to_vault: bool,
    pub auto_reconnect: Option<bool>,
}

#[derive(Default)]
pub(super) struct AskpassSessionBridge {
    pub pending_secret: Mutex<Option<PendingAskpassSecret>>,
    pub pending_host_key: Mutex<Option<PendingAskpassHostKey>>,
    pub staged_secret: Mutex<Option<StagedSecret>>,
}

impl AskpassSessionBridge {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel_pending(&self) {
        if let Ok(mut guard) = self.pending_secret.lock() {
            if let Some(pending) = guard.take() {
                let _ = pending.tx.send(None);
            }
        }
        if let Ok(mut guard) = self.pending_host_key.lock() {
            if let Some(pending) = guard.take() {
                let _ = pending.tx.send(None);
            }
        }
    }

    pub fn stage_secret(&self, staged: StagedSecret) {
        if let Ok(mut guard) = self.staged_secret.lock() {
            *guard = Some(staged);
        }
    }

    pub fn take_staged_secret(&self) -> Option<StagedSecret> {
        self.staged_secret.lock().ok().and_then(|mut g| g.take())
    }

    pub fn clear_staged_secret(&self) {
        if let Ok(mut guard) = self.staged_secret.lock() {
            *guard = None;
        }
    }
}

pub(super) enum PrewarmSink {
    Buffering(Vec<u8>),
    Streaming(tokio::sync::mpsc::Sender<Vec<u8>>),
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
    pub(super) askpass_bridge: Option<Arc<AskpassSessionBridge>>,
    pub(super) askpass_server: Mutex<Option<AskpassServerHandle>>,
    pub(super) manual_disconnect: AtomicBool,
}

impl PtySession {
    pub(super) fn set_askpass_server(&self, handle: AskpassServerHandle) {
        if let Ok(mut guard) = self.askpass_server.lock() {
            *guard = Some(handle);
        }
    }

    pub(super) fn cancel_pending_askpass(&self) {
        if let Some(ref bridge) = self.askpass_bridge {
            bridge.cancel_pending();
        }
    }

    pub(super) fn shutdown_askpass(&self) {
        self.cancel_pending_askpass();
        if let Ok(mut guard) = self.askpass_server.lock() {
            if let Some(handle) = guard.take() {
                handle.shutdown();
            }
        }
    }

    pub(super) fn deliver_askpass_secret(
        &self,
        secret: Zeroizing<String>,
    ) -> Option<(String, bool)> {
        let bridge = self.askpass_bridge.as_ref()?;
        let pending = bridge.pending_secret.lock().ok()?.take()?;
        let info = (pending.prompt_type, pending.is_reusable);
        let _ = pending.tx.send(Some(secret));
        Some(info)
    }

    pub(super) fn deliver_askpass_host_key(&self, reply: Option<String>) -> bool {
        let Some(ref bridge) = self.askpass_bridge else {
            return false;
        };
        let Ok(mut guard) = bridge.pending_host_key.lock() else {
            return false;
        };
        let Some(pending) = guard.take() else {
            return false;
        };
        let _ = pending.tx.send(reply);
        true
    }

    pub(super) fn stage_secret(&self, staged: StagedSecret) {
        if let Some(ref bridge) = self.askpass_bridge {
            bridge.stage_secret(staged);
        }
    }

    pub(super) fn take_staged_secret(&self) -> Option<StagedSecret> {
        self.askpass_bridge.as_ref()?.take_staged_secret()
    }

    pub(super) fn clear_staged_secret(&self) {
        if let Some(ref bridge) = self.askpass_bridge {
            bridge.clear_staged_secret();
        }
    }

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
        self.shutdown_askpass();
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
    pub map: Arc<DashMap<String, Arc<AtomicBool>>>,
    pub tab_id: String,
}

impl Drop for InFlightConnectGuard {
    fn drop(&mut self) {
        self.map.remove(&self.tab_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn askpass_bridge_stages_clears_and_takes_secret_with_vault_metadata() {
        let bridge = AskpassSessionBridge::new();
        bridge.stage_secret(StagedSecret {
            kind: TabSecretKind::Password,
            secret: Zeroizing::new("pw-123".to_string()),
            save_to_vault: true,
            auto_reconnect: Some(true),
        });
        bridge.clear_staged_secret();
        assert!(bridge.take_staged_secret().is_none());

        bridge.stage_secret(StagedSecret {
            kind: TabSecretKind::KeyPassphrase,
            secret: Zeroizing::new("pass-456".to_string()),
            save_to_vault: true,
            auto_reconnect: None,
        });
        let taken = bridge.take_staged_secret().expect("staged secret");
        assert_eq!(taken.kind, TabSecretKind::KeyPassphrase);
        assert_eq!(taken.secret.as_str(), "pass-456");
        assert!(taken.save_to_vault);
        assert_eq!(taken.auto_reconnect, None);
        assert!(bridge.take_staged_secret().is_none());
    }
}
