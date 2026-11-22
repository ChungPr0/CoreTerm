use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

use super::job::{TransferDirection, TransferJobRecord};
use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::{join_remote_path, next_numbered_name, parent_remote_path, remote_leaf_name};
use crate::infra::local_fs::clean_display_path;
use crate::ipc::dto::SftpTransferConflictEventDto;
pub use crate::ipc::events::EVENT_SFTP_TRANSFER_CONFLICT;
use crate::sftp::session::RemoteSftpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ConflictPolicy {
    #[default]
    Ask,
    Overwrite,
    Skip,
    Rename,
    Resume,
}

impl ConflictPolicy {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_uppercase().as_str() {
            "OVERWRITE" => Self::Overwrite,
            "SKIP" => Self::Skip,
            "RENAME" => Self::Rename,
            "RESUME" => Self::Resume,
            _ => Self::Ask,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ConflictDecision {
    pub action: ConflictPolicy,
    pub apply_to_all: bool,
}

#[derive(Default)]
pub struct BatchConflictState {
    default_policy: Mutex<ConflictPolicy>,
    remembered_choice: Mutex<Option<ConflictPolicy>>,
    prompt_gate: AsyncMutex<()>,
}

impl BatchConflictState {
    pub fn new(policy: ConflictPolicy) -> Arc<Self> {
        Arc::new(Self {
            default_policy: Mutex::new(policy),
            remembered_choice: Mutex::new(None),
            prompt_gate: AsyncMutex::new(()),
        })
    }

    pub fn current_policy(&self) -> ConflictPolicy {
        if let Ok(guard) = self.remembered_choice.lock() {
            if let Some(choice) = *guard {
                return choice;
            }
        }
        self.default_policy
            .lock()
            .map(|g| *g)
            .unwrap_or(ConflictPolicy::Ask)
    }

    pub fn remember_for_batch(&self, choice: ConflictPolicy) {
        if let Ok(mut guard) = self.remembered_choice.lock() {
            *guard = Some(choice);
        }
    }
}

pub struct ConflictContext<'a> {
    pub app: &'a AppHandle,
    pub tab_id: &'a str,
    pub client: &'a RemoteSftpClient,
    pub pending_conflicts: &'a DashMap<String, oneshot::Sender<ConflictDecision>>,
}

pub struct ConflictDetails<'a> {
    pub dest_path: &'a str,
    pub source_size: u64,
    pub dest_size: u64,
    pub dest_mtime_ms: Option<u64>,
    pub can_resume: bool,
}

pub async fn resolve_destination_conflict(
    ctx: &ConflictContext<'_>,
    job: &Arc<TransferJobRecord>,
    info: ConflictDetails<'_>,
) -> CoreResult<ConflictPolicy> {
    // Serialize conflict prompts across concurrent batch workers so "Apply to all" covers waiters.
    let _gate = job.batch_conflict.prompt_gate.lock().await;
    let current = job.batch_conflict.current_policy();
    if current != ConflictPolicy::Ask {
        return Ok(current);
    }

    let source_mtime_ms = match job.direction {
        TransferDirection::Upload => fs::metadata(&job.source_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64),
        TransferDirection::Download => ctx
            .client
            .try_stat(&job.source_path)
            .await?
            .and_then(|a| a.mtime.map(|s| s as u64 * 1000)),
    };

    let conflict_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    ctx.pending_conflicts.insert(conflict_id.clone(), tx);

    let file_name = job.file_name.lock().map(|g| g.clone()).unwrap_or_default();
    let _ = ctx.app.emit(
        EVENT_SFTP_TRANSFER_CONFLICT,
        SftpTransferConflictEventDto {
            conflict_id: conflict_id.clone(),
            tab_id: ctx.tab_id.to_string(),
            job_id: job.job_id.clone(),
            direction: job.direction.as_str().to_string(),
            file_name,
            source_path: job.source_path.clone(),
            dest_path: info.dest_path.to_string(),
            source_size: info.source_size,
            source_mtime_ms,
            dest_size: info.dest_size,
            dest_mtime_ms: info.dest_mtime_ms,
            can_resume: info.can_resume,
        },
    );

    let decision = tokio::select! {
        _ = job.cancel_token.cancelled() => {
            ctx.pending_conflicts.remove(&conflict_id);
            return Ok(ConflictPolicy::Skip);
        }
        res = rx => match res {
            Ok(d) => d,
            Err(_) => return Ok(ConflictPolicy::Skip),
        }
    };

    if decision.apply_to_all {
        job.batch_conflict.remember_for_batch(decision.action);
    }
    Ok(decision.action)
}

pub async fn find_non_colliding_dest(
    client: &RemoteSftpClient,
    direction: TransferDirection,
    original: &str,
) -> CoreResult<String> {
    for idx in 1..=999usize {
        let candidate = match direction {
            TransferDirection::Upload => {
                let parent = parent_remote_path(original);
                let next_name = next_numbered_name(remote_leaf_name(original), idx);
                join_remote_path(&parent, &next_name)?
            }
            TransferDirection::Download => {
                let orig_path = Path::new(original);
                let parent = orig_path.parent().ok_or_else(|| {
                    CoreError::Validation("Cannot rename file at filesystem root".to_string())
                })?;
                let leaf = orig_path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "file".to_string());
                clean_display_path(&parent.join(next_numbered_name(&leaf, idx)))
            }
        };

        let exists = match direction {
            TransferDirection::Upload => client.try_stat(&candidate).await?.is_some(),
            TransferDirection::Download => Path::new(&candidate).exists(),
        };
        if !exists {
            return Ok(candidate);
        }
    }

    Err(CoreError::Sftp(format!(
        "Could not find unique filename after 999 attempts for '{original}'"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conflict_policy_parsing() {
        assert_eq!(ConflictPolicy::default(), ConflictPolicy::Ask);
        assert_eq!(ConflictPolicy::parse("ASK"), ConflictPolicy::Ask);
        assert_eq!(ConflictPolicy::parse("  ask  "), ConflictPolicy::Ask);
        assert_eq!(ConflictPolicy::parse("overwrite"), ConflictPolicy::Overwrite);
        assert_eq!(ConflictPolicy::parse("  OVERWRITE \t"), ConflictPolicy::Overwrite);
        assert_eq!(ConflictPolicy::parse("SKIP"), ConflictPolicy::Skip);
        assert_eq!(ConflictPolicy::parse("rename"), ConflictPolicy::Rename);
        assert_eq!(ConflictPolicy::parse(" rEnAmE "), ConflictPolicy::Rename);
        assert_eq!(ConflictPolicy::parse("RESUME"), ConflictPolicy::Resume);
        assert_eq!(ConflictPolicy::parse(""), ConflictPolicy::Ask);
        assert_eq!(ConflictPolicy::parse("   "), ConflictPolicy::Ask);
        assert_eq!(ConflictPolicy::parse("unknown_policy"), ConflictPolicy::Ask);
    }

    #[test]
    fn test_batch_conflict_state_remembers_choice() {
        let state = BatchConflictState::new(ConflictPolicy::Skip);
        assert_eq!(state.current_policy(), ConflictPolicy::Skip);

        state.remember_for_batch(ConflictPolicy::Overwrite);
        assert_eq!(state.current_policy(), ConflictPolicy::Overwrite);

        // Remembering another choice overrides the previous one
        state.remember_for_batch(ConflictPolicy::Rename);
        assert_eq!(state.current_policy(), ConflictPolicy::Rename);
    }
}
