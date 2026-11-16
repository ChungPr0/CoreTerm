use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use dashmap::mapref::entry::Entry;
use dashmap::DashMap;
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;
use zeroize::Zeroizing;

use crate::core::error::{dedupe_error_text, CoreError, CoreResult};
use crate::hosts::HostService;
use crate::ipc::dto::{SftpConnectAckDto, SftpEntryDto, SftpTransferJobDto};
use crate::keys::KeyService;
use crate::sftp::auth::{
    apply_host_key_decision, deliver_secret_decision, PendingPromptSlots,
};
use crate::sftp::session::{emit_status, RemoteSftpClient, SftpConnectParams};
use crate::sftp::transfer::TransferEngine;

enum TabSessionEntry {
    Connecting {
        host_id: String,
        prompts: PendingPromptSlots,
        cancel_token: CancellationToken,
    },
    Connected {
        host_id: String,
        client: Arc<RemoteSftpClient>,
        transfers: Arc<TransferEngine>,
        cancel_token: CancellationToken,
    },
}

struct SessionSlot {
    gen_id: u64,
    entry: Arc<TabSessionEntry>,
}

/// Manages active SFTP connections and transfer engines keyed by `tab_id`.
#[derive(Default)]
pub struct SftpSessionManager {
    sessions: DashMap<String, SessionSlot>,
    next_gen: AtomicU64,
}

impl SftpSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
            next_gen: AtomicU64::new(0),
        }
    }

    async fn teardown_entry(
        app: &AppHandle,
        tab_id: &str,
        entry: &TabSessionEntry,
        emit_event: bool,
    ) {
        match entry {
            TabSessionEntry::Connecting {
                host_id,
                prompts,
                cancel_token,
            } => {
                cancel_token.cancel();
                prompts.cancel_all();
                if emit_event {
                    emit_status(app, tab_id, host_id, "DISCONNECTED", None, None);
                }
            }
            TabSessionEntry::Connected {
                host_id,
                client,
                transfers,
                cancel_token,
            } => {
                cancel_token.cancel();
                transfers.cancel_all();
                client.disconnect().await;
                if emit_event {
                    emit_status(app, tab_id, host_id, "DISCONNECTED", None, None);
                }
            }
        }
    }

    /// Connects (or replaces) an SFTP session for `tab_id` targeting `host_id`.
    pub async fn connect(
        &self,
        app: &AppHandle,
        hosts: &HostService,
        keys: &KeyService,
        tab_id: &str,
        host_id: &str,
    ) -> CoreResult<SftpConnectAckDto> {
        let trimmed_tab = tab_id.trim();
        let trimmed_host = host_id.trim();
        if trimmed_tab.is_empty() || trimmed_host.is_empty() {
            return Err(CoreError::Validation(
                "tab_id and host_id must be non-empty".to_string(),
            ));
        }
        if trimmed_host == "local" {
            return Err(CoreError::Validation(
                "SFTP cannot connect to the local shell pseudo-host".to_string(),
            ));
        }

        let config = hosts.get_detail(trimmed_host)?;
        let prompts = PendingPromptSlots::default();
        let cancel_token = CancellationToken::new();
        let gen_id = self.next_gen.fetch_add(1, Ordering::Relaxed) + 1;

        let prev = self.sessions.insert(
            trimmed_tab.to_string(),
            SessionSlot {
                gen_id,
                entry: Arc::new(TabSessionEntry::Connecting {
                    host_id: trimmed_host.to_string(),
                    prompts: prompts.clone(),
                    cancel_token: cancel_token.clone(),
                }),
            },
        );
        if let Some(prev_slot) = prev {
            Self::teardown_entry(app, trimmed_tab, &prev_slot.entry, false).await;
        }

        let connect_result = RemoteSftpClient::connect(SftpConnectParams {
            tab_id: trimmed_tab.to_string(),
            config,
            hosts,
            keys,
            app,
            prompts,
            cancel_token: cancel_token.clone(),
        })
        .await;

        match connect_result {
            Ok(client) => {
                let home_path = client.home_path.clone();
                let drives = client.drives.clone();
                let client = Arc::new(client);
                let transfers = TransferEngine::new(
                    trimmed_tab.to_string(),
                    app.clone(),
                    Arc::clone(&client),
                    cancel_token.clone(),
                );

                // Upgrade only if this attempt still owns the tab slot.
                let installed = if cancel_token.is_cancelled() {
                    false
                } else if let Entry::Occupied(mut occ) =
                    self.sessions.entry(trimmed_tab.to_string())
                {
                    if occ.get().gen_id == gen_id {
                        occ.insert(SessionSlot {
                            gen_id,
                            entry: Arc::new(TabSessionEntry::Connected {
                                host_id: trimmed_host.to_string(),
                                client: Arc::clone(&client),
                                transfers,
                                cancel_token,
                            }),
                        });
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };

                if !installed {
                    client.disconnect().await;
                    return Err(CoreError::Sftp("Connection cancelled".to_string()));
                }

                Ok(SftpConnectAckDto {
                    tab_id: trimmed_tab.to_string(),
                    host_id: trimmed_host.to_string(),
                    home_path: home_path.clone(),
                    cwd: home_path,
                    drives,
                })
            }
            Err(err) => {
                let removed = self
                    .sessions
                    .remove_if(trimmed_tab, |_, slot| slot.gen_id == gen_id)
                    .is_some();
                if removed && !cancel_token.is_cancelled() {
                    emit_status(
                        app,
                        trimmed_tab,
                        trimmed_host,
                        "ERROR",
                        None,
                        Some(dedupe_error_text(&err.to_string())),
                    );
                }
                Err(err)
            }
        }
    }

    pub async fn disconnect(&self, app: &AppHandle, tab_id: &str) -> CoreResult<()> {
        let trimmed = tab_id.trim();
        if let Some((_, slot)) = self.sessions.remove(trimmed) {
            Self::teardown_entry(app, trimmed, &slot.entry, true).await;
        }
        Ok(())
    }

    /// Cancels all active SFTP connections and file transfers on application exit.
    pub fn shutdown_all(&self) {
        let keys: Vec<String> = self.sessions.iter().map(|e| e.key().clone()).collect();
        for tab_id in keys {
            if let Some((_, slot)) = self.sessions.remove(&tab_id) {
                match slot.entry.as_ref() {
                    TabSessionEntry::Connecting {
                        prompts,
                        cancel_token,
                        ..
                    } => {
                        cancel_token.cancel();
                        prompts.cancel_all();
                    }
                    TabSessionEntry::Connected {
                        transfers,
                        cancel_token,
                        ..
                    } => {
                        cancel_token.cancel();
                        transfers.cancel_all();
                    }
                }
            }
        }
    }

    pub fn submit_secret(
        &self,
        tab_id: &str,
        secret: String,
        save_to_vault: bool,
    ) -> CoreResult<()> {
        let entry = self
            .sessions
            .get(tab_id.trim())
            .ok_or_else(|| CoreError::NotFound(format!("No connecting SFTP session for {tab_id}")))?
            .entry
            .clone();
        match entry.as_ref() {
            TabSessionEntry::Connecting { prompts, .. } => {
                deliver_secret_decision(prompts, Some((Zeroizing::new(secret), save_to_vault)))
            }
            TabSessionEntry::Connected { .. } => Err(CoreError::Validation(
                "SFTP session is already authenticated".to_string(),
            )),
        }
    }

    pub fn submit_host_key(&self, tab_id: &str, action: &str) -> CoreResult<()> {
        let entry = self
            .sessions
            .get(tab_id.trim())
            .ok_or_else(|| CoreError::NotFound(format!("No connecting SFTP session for {tab_id}")))?
            .entry
            .clone();
        match entry.as_ref() {
            TabSessionEntry::Connecting { prompts, .. } => {
                apply_host_key_decision(prompts, action.trim()).map(|_| ())
            }
            TabSessionEntry::Connected { .. } => Err(CoreError::Validation(
                "SFTP session is already connected".to_string(),
            )),
        }
    }

    fn connected_parts(
        &self,
        tab_id: &str,
    ) -> CoreResult<(Arc<RemoteSftpClient>, Arc<TransferEngine>)> {
        let entry = self
            .sessions
            .get(tab_id.trim())
            .ok_or_else(|| CoreError::NotFound(format!("SFTP session not found for {tab_id}")))?
            .entry
            .clone();
        match entry.as_ref() {
            TabSessionEntry::Connected {
                client, transfers, ..
            } => Ok((Arc::clone(client), Arc::clone(transfers))),
            TabSessionEntry::Connecting { .. } => Err(CoreError::Validation(
                "SFTP session is still connecting".to_string(),
            )),
        }
    }

    pub async fn remote_list_dir(
        &self,
        tab_id: &str,
        path: &str,
    ) -> CoreResult<(String, Vec<SftpEntryDto>)> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.list_dir(path).await
    }

    pub async fn remote_create_dir(
        &self,
        tab_id: &str,
        parent_dir: &str,
        name: &str,
    ) -> CoreResult<String> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.create_dir(parent_dir, name).await
    }

    pub async fn remote_rename(
        &self,
        tab_id: &str,
        old_path: &str,
        new_name: &str,
    ) -> CoreResult<String> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.rename_entry(old_path, new_name).await
    }

    pub async fn remote_delete(&self, tab_id: &str, paths: Vec<String>) -> CoreResult<()> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.delete_entries(&paths).await
    }

    pub async fn remote_chmod(&self, tab_id: &str, path: &str, mode: u32) -> CoreResult<()> {
        let (client, _) = self.connected_parts(tab_id)?;
        client.chmod(path, mode).await
    }

    pub async fn enqueue_uploads(
        &self,
        tab_id: &str,
        local_paths: Vec<String>,
        remote_dir: String,
        conflict_policy: String,
    ) -> CoreResult<Vec<SftpTransferJobDto>> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers
            .enqueue_uploads(local_paths, remote_dir, conflict_policy)
            .await
    }

    pub async fn enqueue_downloads(
        &self,
        tab_id: &str,
        remote_paths: Vec<String>,
        local_dir: String,
        conflict_policy: String,
    ) -> CoreResult<Vec<SftpTransferJobDto>> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers
            .enqueue_downloads(remote_paths, local_dir, conflict_policy)
            .await
    }

    pub fn pause_transfer(&self, tab_id: &str, job_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.pause_job(job_id)
    }

    pub fn resume_transfer(&self, tab_id: &str, job_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.resume_job(job_id)
    }

    pub fn cancel_transfer(&self, tab_id: &str, job_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.cancel_job(job_id)
    }

    pub fn resolve_conflict(
        &self,
        tab_id: &str,
        conflict_id: &str,
        action: &str,
        apply_to_all: bool,
    ) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.resolve_conflict(conflict_id, action, apply_to_all)
    }

    pub fn list_transfers(&self, tab_id: &str) -> CoreResult<Vec<SftpTransferJobDto>> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        Ok(transfers.list_jobs())
    }

    pub fn clear_finished_transfers(&self, tab_id: &str) -> CoreResult<()> {
        let (_, transfers) = self.connected_parts(tab_id)?;
        transfers.clear_finished();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_generation_cannot_remove_newer_session() {
        let mgr = SftpSessionManager::new();
        let tab = "tab-1";
        let g1 = mgr.next_gen.fetch_add(1, Ordering::Relaxed) + 1;
        mgr.sessions.insert(
            tab.to_string(),
            SessionSlot {
                gen_id: g1,
                entry: Arc::new(TabSessionEntry::Connecting {
                    host_id: "h1".to_string(),
                    prompts: PendingPromptSlots::default(),
                    cancel_token: CancellationToken::new(),
                }),
            },
        );

        let g2 = mgr.next_gen.fetch_add(1, Ordering::Relaxed) + 1;
        mgr.sessions.insert(
            tab.to_string(),
            SessionSlot {
                gen_id: g2,
                entry: Arc::new(TabSessionEntry::Connecting {
                    host_id: "h1".to_string(),
                    prompts: PendingPromptSlots::default(),
                    cancel_token: CancellationToken::new(),
                }),
            },
        );

        assert!(mgr.sessions.remove_if(tab, |_, slot| slot.gen_id == g1).is_none());
        assert_eq!(mgr.sessions.get(tab).map(|s| s.gen_id), Some(g2));
    }
}
