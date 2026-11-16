use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use tauri::AppHandle;
use tokio::sync::{oneshot, Semaphore};
use tokio_util::sync::CancellationToken;

use super::conflict::{BatchConflictState, ConflictContext, ConflictDecision, ConflictPolicy};
use super::job::{TransferJobRecord, TransferJobSpec, TransferJobStatus};
use super::pipeline::{
    emit_progress, run_transfer_checking_conflict, run_transfer_with_offset, TransferEndState,
};
use super::walker::{collect_download_plan, collect_upload_plan};
use crate::core::error::{dedupe_error_text, CoreError, CoreResult};
use crate::ipc::dto::SftpTransferJobDto;
use crate::sftp::session::RemoteSftpClient;

pub const EVENT_SFTP_TRANSFER_PROGRESS: &str = "sftp:transfer_progress";

const MAX_CONCURRENT_TRANSFERS: usize = 2;

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

    fn get_job(&self, job_id: &str) -> CoreResult<Arc<TransferJobRecord>> {
        self.jobs
            .get(job_id)
            .map(|entry| entry.clone())
            .ok_or_else(|| CoreError::NotFound(format!("Transfer job not found: {job_id}")))
    }

    pub fn pause_job(&self, job_id: &str) -> CoreResult<()> {
        let job = self.get_job(job_id)?;
        if job.begin_pause() {
            emit_progress(&self.app, &job);
        }
        Ok(())
    }

    pub fn resume_job(self: &Arc<Self>, job_id: &str) -> CoreResult<()> {
        let job = self.get_job(job_id)?;
        let Some((next_gen, forced_offset)) = job.begin_resume() else {
            return Ok(());
        };
        emit_progress(&self.app, &job);

        let engine = Arc::clone(self);
        tokio::spawn(async move {
            engine.execute_job(job, next_gen, forced_offset).await;
        });
        Ok(())
    }

    pub fn cancel_job(&self, job_id: &str) -> CoreResult<()> {
        let job = self.get_job(job_id)?;
        if job.begin_cancel() {
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
            run_gen: AtomicU64::new(0),
            conflict_resolved: AtomicBool::new(false),
            exec_lock: tokio::sync::Mutex::new(()),
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
            engine.execute_job(record, 0, None).await;
        });

        dto
    }

    async fn execute_job(
        &self,
        job: Arc<TransferJobRecord>,
        run_gen: u64,
        forced_resume_offset: Option<u64>,
    ) {
        if job.is_superseded(run_gen) || job.paused.load(Ordering::Acquire) {
            return;
        }

        let permit = tokio::select! {
            _ = job.cancel_token.cancelled() => {
                if !job.is_superseded(run_gen) {
                    job.set_status(TransferJobStatus::Cancelled, None);
                    emit_progress(&self.app, &job);
                }
                return;
            }
            p = self.semaphore.clone().acquire_owned() => match p {
                Ok(p) => p,
                Err(_) => return,
            }
        };

        let _exec_guard = job.exec_lock.lock().await;
        if job.is_superseded(run_gen) || job.paused.load(Ordering::Acquire) {
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
            Some(off) => run_transfer_with_offset(&ctx, &job, off, run_gen).await,
            None => run_transfer_checking_conflict(&ctx, &job, run_gen).await,
        };

        if matches!(result, Ok(TransferEndState::Superseded)) || job.is_superseded(run_gen) {
            drop(permit);
            return;
        }

        let (final_status, err) = match result {
            Ok(TransferEndState::Completed) => (TransferJobStatus::Completed, None),
            Ok(TransferEndState::Skipped) => (TransferJobStatus::Skipped, None),
            Ok(TransferEndState::Paused) => (TransferJobStatus::Paused, None),
            Ok(TransferEndState::Cancelled) => (TransferJobStatus::Cancelled, None),
            Ok(TransferEndState::Superseded) => unreachable!(),
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
