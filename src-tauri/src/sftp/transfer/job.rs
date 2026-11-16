use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

use super::conflict::BatchConflictState;
use crate::ipc::dto::SftpTransferJobDto;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferDirection {
    Upload,
    Download,
}

impl TransferDirection {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Upload => "UPLOAD",
            Self::Download => "DOWNLOAD",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferJobStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
    Skipped,
}

impl TransferJobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "QUEUED",
            Self::Running => "RUNNING",
            Self::Paused => "PAUSED",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
            Self::Cancelled => "CANCELLED",
            Self::Skipped => "SKIPPED",
        }
    }

    pub fn is_finished(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Skipped
        )
    }
}

pub struct TransferJobSpec {
    pub direction: TransferDirection,
    pub source_path: String,
    pub dest_path: String,
    pub file_name: String,
    pub total_bytes: u64,
}

pub struct TransferJobRecord {
    pub job_id: String,
    pub tab_id: String,
    pub direction: TransferDirection,
    pub source_path: String,
    pub dest_path: Mutex<String>,
    pub file_name: Mutex<String>,
    pub total_bytes: AtomicU64,
    pub transferred_bytes: AtomicU64,
    pub speed_bps: AtomicU64,
    pub status: Mutex<TransferJobStatus>,
    pub error_message: Mutex<Option<String>>,
    pub paused: AtomicBool,
    pub run_gen: AtomicU64,
    pub conflict_resolved: AtomicBool,
    pub exec_lock: tokio::sync::Mutex<()>,
    pub cancel_token: CancellationToken,
    pub batch_conflict: Arc<BatchConflictState>,
}

impl TransferJobRecord {
    pub fn mark_conflict_resolved(&self) {
        self.conflict_resolved.store(true, Ordering::Release);
    }

    pub fn is_superseded(&self, run_gen: u64) -> bool {
        self.run_gen.load(Ordering::Acquire) != run_gen
    }

    pub(super) fn begin_pause(&self) -> bool {
        let Ok(mut status) = self.status.lock() else {
            return false;
        };
        if !matches!(*status, TransferJobStatus::Queued | TransferJobStatus::Running) {
            return false;
        }
        self.run_gen.fetch_add(1, Ordering::AcqRel);
        self.paused.store(true, Ordering::Release);
        *status = TransferJobStatus::Paused;
        self.speed_bps.store(0, Ordering::Relaxed);
        true
    }

    /// Transitions a paused/failed job back to Queued and returns `(next_gen, forced_resume_offset)`.
    pub(super) fn begin_resume(&self) -> Option<(u64, Option<u64>)> {
        let Ok(mut status) = self.status.lock() else {
            return None;
        };
        if !matches!(*status, TransferJobStatus::Paused | TransferJobStatus::Failed) {
            return None;
        }
        let next_gen = self.run_gen.fetch_add(1, Ordering::AcqRel) + 1;
        self.paused.store(false, Ordering::Release);
        *status = TransferJobStatus::Queued;
        drop(status);
        if let Ok(mut err) = self.error_message.lock() {
            *err = None;
        }
        let forced_offset = if self.conflict_resolved.load(Ordering::Acquire) {
            Some(self.transferred_bytes.load(Ordering::Relaxed))
        } else {
            None
        };
        Some((next_gen, forced_offset))
    }

    pub(super) fn begin_cancel(&self) -> bool {
        let Ok(mut status) = self.status.lock() else {
            return false;
        };
        if status.is_finished() {
            return false;
        }
        self.run_gen.fetch_add(1, Ordering::AcqRel);
        self.cancel_token.cancel();
        *status = TransferJobStatus::Cancelled;
        self.speed_bps.store(0, Ordering::Relaxed);
        true
    }

    pub fn to_dto(&self) -> SftpTransferJobDto {
        let dest_path = self.dest_path.lock().map(|g| g.clone()).unwrap_or_default();
        let file_name = self.file_name.lock().map(|g| g.clone()).unwrap_or_default();
        let status = self
            .status
            .lock()
            .map(|g| g.as_str().to_string())
            .unwrap_or_else(|_| "FAILED".to_string());
        let error_message = self.error_message.lock().map(|g| g.clone()).unwrap_or(None);

        SftpTransferJobDto {
            job_id: self.job_id.clone(),
            tab_id: self.tab_id.clone(),
            direction: self.direction.as_str().to_string(),
            source_path: self.source_path.clone(),
            dest_path,
            file_name,
            total_bytes: self.total_bytes.load(Ordering::Relaxed),
            transferred_bytes: self.transferred_bytes.load(Ordering::Relaxed),
            speed_bps: self.speed_bps.load(Ordering::Relaxed),
            status,
            error_message,
        }
    }

    pub(super) fn set_status(&self, new_status: TransferJobStatus, err: Option<String>) {
        if let Ok(mut g) = self.status.lock() {
            *g = new_status;
        }
        if err.is_some() {
            if let Ok(mut g) = self.error_message.lock() {
                *g = err;
            }
        } else if !matches!(new_status, TransferJobStatus::Failed) {
            if let Ok(mut g) = self.error_message.lock() {
                *g = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::conflict::ConflictPolicy;
    use super::*;

    fn sample_job() -> TransferJobRecord {
        TransferJobRecord {
            job_id: "job-1".into(),
            tab_id: "tab-1".into(),
            direction: TransferDirection::Upload,
            source_path: "C:\\tmp\\a.bin".into(),
            dest_path: Mutex::new("/tmp/a.bin".into()),
            file_name: Mutex::new("a.bin".into()),
            total_bytes: AtomicU64::new(1024),
            transferred_bytes: AtomicU64::new(0),
            speed_bps: AtomicU64::new(500),
            status: Mutex::new(TransferJobStatus::Queued),
            error_message: Mutex::new(None),
            paused: AtomicBool::new(false),
            run_gen: AtomicU64::new(0),
            conflict_resolved: AtomicBool::new(false),
            exec_lock: tokio::sync::Mutex::new(()),
            cancel_token: CancellationToken::new(),
            batch_conflict: BatchConflictState::new(ConflictPolicy::Ask),
        }
    }

    #[test]
    fn test_transfer_status_terminal_flags() {
        assert!(!TransferJobStatus::Queued.is_finished());
        assert!(!TransferJobStatus::Running.is_finished());
        assert!(!TransferJobStatus::Paused.is_finished());
        assert!(TransferJobStatus::Completed.is_finished());
        assert!(TransferJobStatus::Failed.is_finished());
        assert!(TransferJobStatus::Cancelled.is_finished());
        assert!(TransferJobStatus::Skipped.is_finished());
    }

    #[test]
    fn pause_resume_while_queued_supersedes_old_worker_and_preserves_conflict_check() {
        let job = sample_job();
        assert!(!job.is_superseded(0));

        assert!(job.begin_pause());
        assert!(job.is_superseded(0));
        assert_eq!(job.speed_bps.load(Ordering::Relaxed), 0);

        // Pausing while queued keeps conflict_resolved=false so resume re-runs conflict check.
        let (next_gen, forced_offset) = job.begin_resume().expect("resume from paused");
        assert!(job.is_superseded(0));
        assert!(!job.is_superseded(next_gen));
        assert_eq!(forced_offset, None);

        // Once conflict resolution has passed, pause+resume resumes from transferred offset.
        job.mark_conflict_resolved();
        job.transferred_bytes.store(256, Ordering::Relaxed);
        assert!(job.begin_pause());
        let (gen2, offset2) = job.begin_resume().expect("resume with resolved conflict");
        assert!(!job.is_superseded(gen2));
        assert_eq!(offset2, Some(256));
    }
}
