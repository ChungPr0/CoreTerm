use std::io::SeekFrom;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeekExt, AsyncWrite, AsyncWriteExt};

use super::conflict::{
    find_non_colliding_dest, resolve_destination_conflict, ConflictContext, ConflictDetails,
    ConflictPolicy,
};
use super::job::{TransferDirection, TransferJobRecord};
use crate::core::defaults::{SFTP_COPY_CHUNK_BYTES, SFTP_PROGRESS_EMIT_INTERVAL_MS};
use crate::core::error::{dedupe_error_text, CoreError, CoreResult};
use crate::core::path_guard::remote_leaf_name;
use crate::ipc::events::EVENT_SFTP_TRANSFER_PROGRESS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferEndState {
    Completed,
    Skipped,
    Paused,
    Cancelled,
    Superseded,
}

async fn verify_transfer_endpoint_intact(
    direction: TransferDirection,
    source_path: &str,
    dest_path: &str,
) -> CoreResult<()> {
    match direction {
        TransferDirection::Download if !dest_path.is_empty() => {
            match tokio::fs::metadata(dest_path).await {
                Ok(meta) if meta.is_dir() => Err(CoreError::Validation(
                    "Destination file was deleted or corrupted during transfer".to_string(),
                )),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(CoreError::Validation(
                    "Destination file was deleted or corrupted during transfer".to_string(),
                )),
                _ => Ok(()),
            }
        }
        TransferDirection::Upload => match tokio::fs::metadata(source_path).await {
            Ok(meta) if meta.is_dir() => Err(CoreError::Validation(
                "Source file was deleted or corrupted during transfer".to_string(),
            )),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(CoreError::Validation(
                "Source file was deleted or corrupted during transfer".to_string(),
            )),
            _ => Ok(()),
        },
        _ => Ok(()),
    }
}

pub async fn run_transfer_checking_conflict(
    ctx: &ConflictContext<'_>,
    job: &Arc<TransferJobRecord>,
    run_gen: u64,
) -> CoreResult<TransferEndState> {
    let mut dest_path = job.dest_path.lock().map(|g| g.clone()).unwrap_or_default();
    let mut resume_offset = 0u64;

    let dest_meta = match job.direction {
        TransferDirection::Upload => ctx
            .client
            .try_stat(&dest_path)
            .await?
            .map(|a| (a.len(), a.mtime.map(|m| m as u64 * 1000), a.file_type().is_dir())),
        TransferDirection::Download => match tokio::fs::metadata(&dest_path).await {
            Ok(m) => {
                let mtime = m
                    .modified()
                    .ok()
                    .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64);
                Some((m.len(), mtime, m.is_dir()))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(CoreError::Io(e)),
        },
    };

    if let Some((dest_size, dest_mtime_ms, dest_is_dir)) = dest_meta {
        if dest_is_dir {
            return Err(CoreError::Validation(format!(
                "Destination '{dest_path}' already exists as a directory"
            )));
        }

        let source_size = job.total_bytes.load(Ordering::Relaxed);
        let can_resume = dest_size > 0 && dest_size < source_size;
        let chosen = resolve_destination_conflict(
            ctx,
            job,
            ConflictDetails {
                dest_path: &dest_path,
                source_size,
                dest_size,
                dest_mtime_ms,
                can_resume,
            },
        )
        .await?;

        match chosen {
            ConflictPolicy::Skip | ConflictPolicy::Ask => return Ok(TransferEndState::Skipped),
            ConflictPolicy::Overwrite => resume_offset = 0,
            ConflictPolicy::Resume => {
                resume_offset = if can_resume { dest_size } else { 0 };
            }
            ConflictPolicy::Rename => {
                dest_path = find_non_colliding_dest(ctx.client, job.direction, &dest_path).await?;
                let leaf = match job.direction {
                    TransferDirection::Upload => remote_leaf_name(&dest_path).to_string(),
                    TransferDirection::Download => Path::new(&dest_path)
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                };
                if let Ok(mut g) = job.dest_path.lock() {
                    *g = dest_path.clone();
                }
                if let Ok(mut g) = job.file_name.lock() {
                    *g = leaf;
                }
                emit_progress(ctx.app, job);
                resume_offset = 0;
            }
        }
    }

    if job.is_superseded(run_gen) {
        return Ok(TransferEndState::Superseded);
    }
    if job.paused.load(Ordering::Acquire) {
        return Ok(TransferEndState::Paused);
    }

    job.mark_conflict_resolved();
    run_transfer_with_offset(ctx, job, resume_offset, run_gen).await
}

pub async fn run_transfer_with_offset(
    ctx: &ConflictContext<'_>,
    job: &Arc<TransferJobRecord>,
    requested_offset: u64,
    run_gen: u64,
) -> CoreResult<TransferEndState> {
    let dest_path = job.dest_path.lock().map(|g| g.clone()).unwrap_or_default();
    let total = job.total_bytes.load(Ordering::Relaxed);
    let offset = requested_offset.min(total);
    job.transferred_bytes.store(offset, Ordering::Relaxed);

    match job.direction {
        TransferDirection::Upload => {
            if offset > 0 {
                let source_meta = tokio::fs::metadata(&job.source_path).await?;
                if source_meta.len() < offset {
                    return Err(CoreError::Validation(
                        "Source file was truncated while paused".to_string(),
                    ));
                }
                let dest_meta = ctx.client.try_stat(&dest_path).await?;
                let dest_len = dest_meta.map(|a| a.len()).unwrap_or(0);
                if dest_len < offset {
                    return Err(CoreError::Validation(
                        "Remote destination file was deleted or corrupted while paused".to_string(),
                    ));
                }
            }
            let mut reader = tokio::fs::File::open(&job.source_path).await?;
            if offset > 0 {
                reader.seek(SeekFrom::Start(offset)).await?;
            }
            let mut writer = ctx.client.open_write(&dest_path, offset == 0).await?;
            if offset > 0 {
                writer.seek(SeekFrom::Start(offset)).await.map_err(|e| {
                    CoreError::Sftp(format!("Seek failed: {}", dedupe_error_text(&e.to_string())))
                })?;
            }
            stream_copy_with_controls(ctx.app, job, &mut reader, &mut writer, run_gen).await
        }
        TransferDirection::Download => {
            if offset > 0 {
                let dest_len = match tokio::fs::metadata(&dest_path).await {
                    Ok(m) => m.len(),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
                    Err(e) => return Err(CoreError::Io(e)),
                };
                if dest_len < offset {
                    return Err(CoreError::Validation(
                        "Destination file was deleted or corrupted while paused".to_string(),
                    ));
                }
            }
            let mut reader = ctx.client.open_read(&job.source_path).await?;
            if offset > 0 {
                reader.seek(SeekFrom::Start(offset)).await.map_err(|e| {
                    CoreError::Sftp(format!("Seek failed: {}", dedupe_error_text(&e.to_string())))
                })?;
            }
            let mut writer = tokio::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(offset == 0)
                .open(&dest_path)
                .await?;
            if offset > 0 {
                writer.seek(SeekFrom::Start(offset)).await?;
            }
            stream_copy_with_controls(ctx.app, job, &mut reader, &mut writer, run_gen).await
        }
    }
}

async fn stream_copy_with_controls<R, W>(
    app: &AppHandle,
    job: &Arc<TransferJobRecord>,
    reader: &mut R,
    writer: &mut W,
    run_gen: u64,
) -> CoreResult<TransferEndState>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buf = vec![0u8; SFTP_COPY_CHUNK_BYTES];
    let mut last_emit = Instant::now();
    let mut speed_window_start = Instant::now();
    let mut speed_window_bytes = 0u64;
    let mut last_disk_check = Instant::now();
    let dest_path = job.dest_path.lock().map(|g| g.clone()).unwrap_or_default();

    loop {
        if job.is_superseded(run_gen) {
            let _ = writer.shutdown().await;
            return Ok(TransferEndState::Superseded);
        }
        if job.paused.load(Ordering::Acquire) {
            let _ = writer.shutdown().await;
            return Ok(TransferEndState::Paused);
        }
        if job.cancel_token.is_cancelled() {
            let _ = writer.shutdown().await;
            return Ok(TransferEndState::Cancelled);
        }

        let read_bytes = tokio::select! {
            _ = job.cancel_token.cancelled() => {
                let _ = writer.shutdown().await;
                return Ok(TransferEndState::Cancelled);
            }
            res = reader.read(&mut buf) => res.map_err(CoreError::Io)?,
        };

        if read_bytes == 0 {
            writer.shutdown().await.map_err(CoreError::Io)?;
            verify_transfer_endpoint_intact(job.direction, &job.source_path, &dest_path).await?;
            return Ok(TransferEndState::Completed);
        }

        tokio::select! {
            _ = job.cancel_token.cancelled() => {
                let _ = writer.shutdown().await;
                return Ok(TransferEndState::Cancelled);
            }
            res = writer.write_all(&buf[..read_bytes]) => res.map_err(CoreError::Io)?,
        }

        job.transferred_bytes
            .fetch_add(read_bytes as u64, Ordering::Relaxed);
        speed_window_bytes += read_bytes as u64;

        if last_disk_check.elapsed() >= Duration::from_millis(500) {
            last_disk_check = Instant::now();
            if let Err(err) =
                verify_transfer_endpoint_intact(job.direction, &job.source_path, &dest_path).await
            {
                let _ = writer.shutdown().await;
                return Err(err);
            }
        }

        let window_elapsed = speed_window_start.elapsed();
        if window_elapsed >= Duration::from_millis(500) {
            let secs = window_elapsed.as_secs_f64();
            if secs > 0.0 {
                job.speed_bps
                    .store((speed_window_bytes as f64 / secs) as u64, Ordering::Relaxed);
            }
            speed_window_bytes = 0;
            speed_window_start = Instant::now();
        }

        if last_emit.elapsed().as_millis() >= SFTP_PROGRESS_EMIT_INTERVAL_MS {
            emit_progress(app, job);
            last_emit = Instant::now();
        }
    }
}

pub fn emit_progress(app: &AppHandle, job: &TransferJobRecord) {
    let _ = app.emit(EVENT_SFTP_TRANSFER_PROGRESS, job.to_dto());
}
