use russh_sftp::protocol::OpenFlags;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::normalize_remote_path;
use crate::core::text_guard::{
    decode_editable_utf8, validate_editable_size, MAX_EDITABLE_FILE_BYTES,
};
use crate::ipc::dto::{FileContentDto, FileWriteResultDto};

use super::error_map::map_sftp_error;
use super::session::RemoteSftpClient;

impl RemoteSftpClient {
    pub async fn read_text_file(&self, path: &str) -> CoreResult<FileContentDto> {
        let normalized = normalize_remote_path(path);
        let attrs = self
            .sftp
            .metadata(&normalized)
            .await
            .map_err(|e| map_sftp_error("Failed to read remote file", e))?;
        if attrs.file_type().is_dir() {
            return Err(CoreError::Validation("Cannot edit a directory".to_string()));
        }
        if !attrs.file_type().is_file() {
            return Err(CoreError::Validation(
                "Binary or non-UTF-8 file cannot be edited".to_string(),
            ));
        }
        validate_editable_size(attrs.len())?;

        let file = self
            .sftp
            .open_with_flags(&normalized, OpenFlags::READ)
            .await
            .map_err(|e| map_sftp_error("Failed to read remote file", e))?;
        let mut limited = file.take(MAX_EDITABLE_FILE_BYTES + 1);
        let mut bytes = Vec::with_capacity((attrs.len() as usize).min(65536));
        limited
            .read_to_end(&mut bytes)
            .await
            .map_err(|e| CoreError::Sftp(format!("Failed to read remote file: {e}")))?;

        let size = bytes.len() as u64;
        let content = decode_editable_utf8(bytes)?;
        let readonly = attrs
            .permissions
            .map(|p| (p & 0o222) == 0 && (p & 0o777) != 0)
            .unwrap_or(false);
        Ok(FileContentDto {
            path: normalized,
            content,
            size,
            mtime_ms: attrs.mtime.map(|sec| sec as u64 * 1000),
            readonly,
        })
    }

    pub async fn write_text_file(
        &self,
        path: &str,
        content: &str,
    ) -> CoreResult<FileWriteResultDto> {
        let normalized = normalize_remote_path(path);
        let raw_bytes = content.as_bytes();
        validate_editable_size(raw_bytes.len() as u64)?;

        let mut file = self
            .open_write(&normalized, true)
            .await
            .map_err(|e| match e {
                CoreError::Sftp(msg) => {
                    let detail = msg
                        .strip_prefix("Failed to open remote file for writing: ")
                        .unwrap_or(&msg);
                    CoreError::Sftp(format!("Failed to write remote file: {detail}"))
                }
                other => other,
            })?;
        file.write_all(raw_bytes)
            .await
            .map_err(|e| CoreError::Sftp(format!("Failed to write remote file: {e}")))?;
        file.flush()
            .await
            .map_err(|e| CoreError::Sftp(format!("Failed to write remote file: {e}")))?;
        file.shutdown()
            .await
            .map_err(|e| CoreError::Sftp(format!("Failed to write remote file: {e}")))?;

        let attrs = self.try_stat(&normalized).await.ok().flatten();
        Ok(FileWriteResultDto {
            path: normalized,
            size: attrs
                .as_ref()
                .map(|a| a.len())
                .unwrap_or(raw_bytes.len() as u64),
            mtime_ms: attrs.and_then(|a| a.mtime.map(|sec| sec as u64 * 1000)),
        })
    }

    pub async fn open_read(&self, path: &str) -> CoreResult<russh_sftp::client::fs::File> {
        self.sftp
            .open_with_flags(path, OpenFlags::READ)
            .await
            .map_err(|e| map_sftp_error("Failed to open remote file for reading", e))
    }

    pub async fn open_write(
        &self,
        path: &str,
        truncate: bool,
    ) -> CoreResult<russh_sftp::client::fs::File> {
        let flags = if truncate {
            OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE
        } else {
            OpenFlags::CREATE | OpenFlags::WRITE
        };
        self.sftp
            .open_with_flags(path, flags)
            .await
            .map_err(|e| map_sftp_error("Failed to open remote file for writing", e))
    }
}
