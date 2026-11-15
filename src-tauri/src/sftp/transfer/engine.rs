use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use tauri::AppHandle;
use tokio::sync::{oneshot, Semaphore};
use tokio_util::sync::CancellationToken;

use super::conflict::{BatchConflictState, ConflictContext, ConflictDecision, ConflictPolicy};
use super::pipeline::{
    emit_progress, run_transfer_checking_conflict, run_transfer_with_offset, TransferEndState,
};
use super::walker::{collect_download_plan, collect_upload_plan};
use crate::core::error::{dedupe_error_text, CoreError, CoreResult};
use crate::ipc::dto::SftpTransferJobDto;
use crate::sftp::session::RemoteSftpClient;

pub const EVENT_SFTP_TRANSFER_PROGRESS: &str = "sftp:transfer_progress";

const MAX_CONCURRENT_TRANSFERS: usize = 2;

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
    pub cancel_token: CancellationToken,
    pub batch_conflict: Arc<BatchConflictState>,
}

impl TransferJobRecord {
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

    fn set_status(&self, new_status: TransferJobStatus, err: Option<String>) {
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

/// Manages queued, running, and paused file transfers for a single connected SFTP session.
pub struct TransferEngine {
    tab_id: String,
    app: AppHandle,
    client: Arc<RemoteSftpClient>,
    semaphore: Arc<Semaphore>,
    session_cancel: CancellationToken,
    jobs_order: Mutex<Vec<String>>,
    jobs: DashMap<String, Arc<TransferJobRecord>>,
    pending_conflicts: DashMap<String, oneshot::Sender<ConflictDecision>>,
}

impl TransferEngine {
    pub fn new(
        tab_id: String,
        app: AppHandle,
        client: Arc<RemoteSftpClient>,
        session_cancel: CancellationToken,
    ) -> Arc<Self> {
        Arc::new(Self {
            tab_id,
            app,
            client,
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_TRANSFERS)),
            session_cancel,
            jobs_order: Mutex::new(Vec::new()),
            jobs: DashMap::new(),
            pending_conflicts: DashMap::new(),
        })
    }

    /// Cancels waiting conflict prompts and active jobs during teardown.
    pub fn cancel_all(&self) {
        self.session_cancel.cancel();
        let keys: Vec<String> = self.pending_conflicts.iter().map(|e| e.key().clone()).collect();
        for key in keys {
            self.pending_conflicts.remove(&key);
        }
    }

    pub fn list_jobs(&self) -> Vec<SftpTransferJobDto> {
        let order = self.jobs_order.lock().map(|g| g.clone()).unwrap_or_default();
        order
            .iter()
            .filter_map(|id| self.jobs.get(id).map(|r| r.to_dto()))
            .collect()
    }

    pub fn clear_finished(&self) {
        let finished_ids: Vec<String> = self
            .jobs
            .iter()
            .filter(|entry| {
                entry
                    .value()
                    .status
                    .lock()
                    .map(|s| s.is_finished())
                    .unwrap_or(false)
            })
            .map(|entry| entry.key().clone())
            .collect();

        for id in &finished_ids {
            self.jobs.remove(id);
        }
        if let Ok(mut order) = self.jobs_order.lock() {
            order.retain(|id| self.jobs.contains_key(id));
        }
    }

    pub async fn enqueue_uploads(
        self: &Arc<Self>,
        local_paths: Vec<String>,
        remote_dir: String,
        conflict_policy: String,
    ) -> CoreResult<Vec<SftpTransferJobDto>> {
        let batch = BatchConflictState::new(ConflictPolicy::parse(&conflict_policy));
        let specs = collect_upload_plan(&self.client, local_paths, &remote_dir).await?;
        Ok(self.spawn_planned_jobs(specs, batch))
    }

    pub async fn enqueue_downloads(
        self: &Arc<Self>,
        remote_paths: Vec<String>,
        local_dir: String,
        conflict_policy: String,
    ) -> CoreResult<Vec<SftpTransferJobDto>> {
        let batch = BatchConflictState::new(ConflictPolicy::parse(&conflict_policy));
        let specs = collect_download_plan(&self.client, remote_paths, &local_dir).await?;
        Ok(self.spawn_planned_jobs(specs, batch))
    }

    fn spawn_planned_jobs(
        self: &Arc<Self>,
        specs: Vec<TransferJobSpec>,
        batch: Arc<BatchConflictState>,
    ) -> Vec<SftpTransferJobDto> {
        specs
            .into_iter()
            .map(|spec| self.spawn_file_job(spec, 0, Arc::clone(&batch)))
            .collect()
    }

    fn get_job(&self, job_id: &str) -> CoreResult<(Arc<TransferJobRecord>, TransferJobStatus)> {
        let job = self
            .jobs
            .get(job_id)
            .ok_or_else(|| CoreError::NotFound(format!("Transfer job not found: {job_id}")))?
            .clone();
        let status = *job
            .status
            .lock()
            .map_err(|_| CoreError::Internal("Transfer status lock poisoned".to_string()))?;
        Ok((job, status))
    }

    pub fn pause_job(&self, job_id: &str) -> CoreResult<()> {
        let (job, current) = self.get_job(job_id)?;
        if matches!(current, TransferJobStatus::Queued | TransferJobStatus::Running) {
            job.paused.store(true, Ordering::Release);
            job.set_status(TransferJobStatus::Paused, None);
            job.speed_bps.store(0, Ordering::Relaxed);
            emit_progress(&self.app, &job);
        }
        Ok(())
    }

    pub fn resume_job(self: &Arc<Self>, job_id: &str) -> CoreResult<()> {
        let (job, current) = self.get_job(job_id)?;
        if !matches!(
            current,
            TransferJobStatus::Paused | TransferJobStatus::Failed
        ) {
            return Ok(());
        }

        job.paused.store(false, Ordering::Release);
        job.set_status(TransferJobStatus::Queued, None);
        emit_progress(&self.app, &job);

        let engine = Arc::clone(self);
        let resume_from = job.transferred_bytes.load(Ordering::Relaxed);
        tokio::spawn(async move {
            engine.execute_job(job, Some(resume_from)).await;
        });
        Ok(())
    }

    pub fn cancel_job(&self, job_id: &str) -> CoreResult<()> {
        let (job, current) = self.get_job(job_id)?;
        if !current.is_finished() {
            job.cancel_token.cancel();
            job.set_status(TransferJobStatus::Cancelled, None);
            job.speed_bps.store(0, Ordering::Relaxed);
            emit_progress(&self.app, &job);
        }
        Ok(())
    }

    pub fn resolve_conflict(
        &self,
        conflict_id: &str,
        action: &str,
        apply_to_all: bool,
    ) -> CoreResult<()> {
        let (_, tx) = self.pending_conflicts.remove(conflict_id).ok_or_else(|| {
            CoreError::NotFound(format!("Conflict prompt not found: {conflict_id}"))
        })?;
        let policy = ConflictPolicy::parse(action);
        let _ = tx.send(ConflictDecision {
            action: policy,
            apply_to_all,
        });
        Ok(())
    }

    fn spawn_file_job(
        self: &Arc<Self>,
        spec: TransferJobSpec,
        resume_offset: u64,
        batch_conflict: Arc<BatchConflictState>,
    ) -> SftpTransferJobDto {
        let job_id = uuid::Uuid::new_v4().to_string();
        let record = Arc::new(TransferJobRecord {
            job_id: job_id.clone(),
            tab_id: self.tab_id.clone(),
            direction: spec.direction,
            source_path: spec.source_path,
            dest_path: Mutex::new(spec.dest_path),
            file_name: Mutex::new(spec.file_name),
            total_bytes: AtomicU64::new(spec.total_bytes),
            transferred_bytes: AtomicU64::new(resume_offset),
            speed_bps: AtomicU64::new(0),
            status: Mutex::new(TransferJobStatus::Queued),
            error_message: Mutex::new(None),
            paused: AtomicBool::new(false),
            cancel_token: self.session_cancel.child_token(),
            batch_conflict,
        });

        self.jobs.insert(job_id.clone(), Arc::clone(&record));
        if let Ok(mut order) = self.jobs_order.lock() {
            order.push(job_id);
        }

        let dto = record.to_dto();
        emit_progress(&self.app, &record);

        let engine = Arc::clone(self);
        tokio::spawn(async move {
            engine.execute_job(record, None).await;
        });

        dto
    }

    async fn execute_job(
        &self,
        job: Arc<TransferJobRecord>,
        forced_resume_offset: Option<u64>,
    ) {
        let permit = tokio::select! {
            _ = job.cancel_token.cancelled() => {
                job.set_status(TransferJobStatus::Cancelled, None);
                emit_progress(&self.app, &job);
                return;
            }
            p = self.semaphore.clone().acquire_owned() => match p {
                Ok(p) => p,
                Err(_) => return,
            }
        };

        if job.paused.load(Ordering::Acquire) {
            drop(permit);
            return;
        }
        if job.cancel_token.is_cancelled() {
            job.set_status(TransferJobStatus::Cancelled, None);
            emit_progress(&self.app, &job);
            drop(permit);
            return;
        }

        job.set_status(TransferJobStatus::Running, None);
        emit_progress(&self.app, &job);

        let ctx = ConflictContext {
            app: &self.app,
            tab_id: &self.tab_id,
            client: &self.client,
            pending_conflicts: &self.pending_conflicts,
        };

        let result = match forced_resume_offset {
            Some(off) => run_transfer_with_offset(&ctx, &job, off).await,
            None => run_transfer_checking_conflict(&ctx, &job).await,
        };

        let (final_status, err) = match result {
            Ok(TransferEndState::Completed) => (TransferJobStatus::Completed, None),
            Ok(TransferEndState::Skipped) => (TransferJobStatus::Skipped, None),
            Ok(TransferEndState::Paused) => (TransferJobStatus::Paused, None),
            Ok(TransferEndState::Cancelled) => (TransferJobStatus::Cancelled, None),
            Err(e) => (
                TransferJobStatus::Failed,
                Some(dedupe_error_text(&e.to_string())),
            ),
        };
        job.speed_bps.store(0, Ordering::Relaxed);
        job.set_status(final_status, err);
        emit_progress(&self.app, &job);

        drop(permit);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
