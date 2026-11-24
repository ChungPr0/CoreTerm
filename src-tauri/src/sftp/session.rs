use std::borrow::Cow;
use std::cmp::Ordering;
use std::sync::Arc;
use std::time::Duration;

use russh::client;
use russh::{Disconnect, Preferred};
use russh_sftp::client::error::Error as SftpClientError;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, OpenFlags, StatusCode};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;

use crate::core::defaults::{
    SFTP_IO_TIMEOUT_SECS, SFTP_MAX_WALK_DEPTH, SFTP_MAX_WALK_ENTRIES, SSH_CONNECT_TIMEOUT_SECS,
};
use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::{
    is_win_drive_root, join_remote_path, normalize_remote_path, parent_remote_path,
    validate_octal_mode, validate_single_entry_name,
};
use crate::hosts::HostService;
use crate::infra::security::TabSecretStore;
use crate::ipc::dto::{
    HostFullConfigDto, LocalDriveDto, SftpEntryDto, SftpStatusEventDto,
};
pub use crate::ipc::events::EVENT_SFTP_STATUS;
use crate::keys::KeyService;

use super::auth::{
    authenticate_session, PendingPromptSlots, RusshClientHandler, SftpAuthContext,
};
pub use super::error_map::{fmt_sftp_err, map_russh_error, map_sftp_error};
use super::win_drives::discover_remote_windows_drives;

/// Active SSH/SFTP client connection backing one tab's file operations.
pub struct RemoteSftpClient {
    pub sftp: Arc<SftpSession>,
    pub home_path: String,
    pub drives: Vec<LocalDriveDto>,
    handle: AsyncMutex<Option<client::Handle<RusshClientHandler>>>,
}

pub struct SftpConnectParams<'a> {
    pub tab_id: String,
    pub config: HostFullConfigDto,
    pub hosts: &'a HostService,
    pub keys: &'a KeyService,
    pub tab_secrets: &'a TabSecretStore,
    pub app: &'a AppHandle,
    pub prompts: PendingPromptSlots,
    pub cancel_token: CancellationToken,
}

impl RemoteSftpClient {
    pub async fn connect(params: SftpConnectParams<'_>) -> CoreResult<Self> {
        let SftpConnectParams {
            tab_id,
            config,
            hosts,
            keys,
            tab_secrets,
            app,
            prompts,
            cancel_token,
        } = params;

        let host = config.host.trim().to_string();
        let username = config.username.trim().to_string();
        if host.is_empty() {
            return Err(CoreError::Validation("Host cannot be empty".to_string()));
        }
        if username.is_empty() {
            return Err(CoreError::Validation(
                "Username cannot be empty".to_string(),
            ));
        }

        emit_status(app, &tab_id, &config.id, "CONNECTING", None, None);

        let mut ssh_cfg = client::Config {
            keepalive_interval: if config.options.server_alive_interval > 0 {
                Some(Duration::from_secs(
                    config.options.server_alive_interval.into(),
                ))
            } else {
                None
            },
            keepalive_max: config.options.server_alive_count_max.max(1) as usize,
            nodelay: true,
            ..Default::default()
        };

        if config.options.compression {
            ssh_cfg.preferred = Preferred {
                compression: Cow::Borrowed(&[
                    russh::compression::ZLIB,
                    russh::compression::NONE,
                ]),
                ..Default::default()
            };
        }

        let handler = RusshClientHandler {
            tab_id: tab_id.clone(),
            host_id: config.id.clone(),
            host: host.clone(),
            port: config.port,
            strict_mode: config.options.strict_host_key_checking.clone(),
            app: app.clone(),
            prompts: prompts.clone(),
            cancel_token: cancel_token.clone(),
        };

        let mut session = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(CoreError::Sftp("Connection cancelled".to_string()));
            }
            res = tokio::time::timeout(
                Duration::from_secs(SSH_CONNECT_TIMEOUT_SECS),
                client::connect(Arc::new(ssh_cfg), (host.as_str(), config.port), handler),
            ) => {
                match res {
                    Ok(conn) => conn.map_err(|e| map_russh_error("SSH connect failed", e))?,
                    Err(_) => return Err(CoreError::Sftp("SSH connection timed out".to_string())),
                }
            }
        };

        let auth_ctx = SftpAuthContext {
            tab_id: &tab_id,
            config: &config,
            hosts,
            keys,
            tab_secrets,
            app,
            prompts: &prompts,
            cancel_token: &cancel_token,
        };
        authenticate_session(&mut session, &auth_ctx).await?;

        let channel = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(CoreError::Sftp("Connection cancelled".to_string()));
            }
            res = session.channel_open_session() => {
                res.map_err(|e| map_russh_error("Failed to open SSH session channel", e))?
            }
        };

        tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(CoreError::Sftp("Connection cancelled".to_string()));
            }
            res = channel.request_subsystem(true, "sftp") => {
                res.map_err(|e| map_russh_error("Failed to start SFTP subsystem", e))?;
            }
        }

        let sftp = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(CoreError::Sftp("Connection cancelled".to_string()));
            }
            res = SftpSession::new(channel.into_stream()) => {
                res.map_err(|e| CoreError::Sftp(format!("Failed to initialize SFTP protocol: {e}")))?
            }
        };
        sftp.set_timeout(SFTP_IO_TIMEOUT_SECS);

        let home_path = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(CoreError::Sftp("Connection cancelled".to_string()));
            }
            res = sftp.canonicalize(".") => {
                res.map(|p| normalize_remote_path(&p))
                    .unwrap_or_else(|_| "/".to_string())
            }
        };

        let sftp = Arc::new(sftp);
        let drives = tokio::select! {
            _ = cancel_token.cancelled() => {
                return Err(CoreError::Sftp("Connection cancelled".to_string()));
            }
            list = discover_remote_windows_drives(&sftp, &home_path) => list,
        };

        emit_status(
            app,
            &tab_id,
            &config.id,
            "CONNECTED",
            Some(home_path.clone()),
            None,
        );

        Ok(Self {
            sftp,
            home_path,
            drives,
            handle: AsyncMutex::new(Some(session)),
        })
    }

    pub async fn disconnect(&self) {
        let _ = self.sftp.close().await;
        if let Some(handle) = self.handle.lock().await.take() {
            let _ = handle
                .disconnect(Disconnect::ByApplication, "User closed SFTP session", "en")
                .await;
        }
    }

    pub async fn list_dir(&self, path: &str) -> CoreResult<(String, Vec<SftpEntryDto>)> {
        let normalized = if path.trim().is_empty() || path.trim() == "~" {
            self.home_path.clone()
        } else {
            normalize_remote_path(path)
        };

        let read_dir = self
            .sftp
            .read_dir(&normalized)
            .await
            .map_err(|e| map_sftp_error("Failed to list remote directory", e))?;

        let mut entries = Vec::new();
        let mut symlink_checks: Vec<(usize, String)> = Vec::new();
        for item in read_dir {
            let name = item.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let entry_path = join_remote_path(&normalized, &name)?;
            let attrs = item.metadata();
            let ftype = attrs.file_type();
            let (kind, symlink_target_is_dir) = if ftype.is_symlink() {
                symlink_checks.push((entries.len(), entry_path.clone()));
                ("SYMLINK", false)
            } else if ftype.is_dir() {
                ("DIR", true)
            } else if ftype.is_file() {
                ("FILE", false)
            } else {
                ("OTHER", false)
            };

            entries.push(SftpEntryDto {
                name,
                path: entry_path,
                kind: kind.to_string(),
                symlink_target_is_dir,
                size: if kind == "DIR" { 0 } else { attrs.len() },
                mtime_ms: attrs.mtime.map(|sec| sec as u64 * 1000),
                permissions: attrs.permissions.map(|p| p & 0o7777),
                permissions_display: attrs.permissions().to_string(),
                owner: attrs.user.clone(),
                group: attrs.group.clone(),
            });
        }

        if !symlink_checks.is_empty() {
            let sem = Arc::new(tokio::sync::Semaphore::new(16));
            let mut join_set = tokio::task::JoinSet::new();
            for (idx, path) in symlink_checks {
                let sftp = Arc::clone(&self.sftp);
                let sem = Arc::clone(&sem);
                join_set.spawn(async move {
                    let _permit = sem.acquire().await.ok();
                    let is_dir = sftp
                        .metadata(&path)
                        .await
                        .map(|m| m.file_type().is_dir())
                        .unwrap_or(false);
                    (idx, is_dir)
                });
            }
            while let Some(res) = join_set.join_next().await {
                if let Ok((idx, is_dir)) = res {
                    if let Some(entry) = entries.get_mut(idx) {
                        entry.symlink_target_is_dir = is_dir;
                    }
                }
            }
        }

        entries.sort_by(|a, b| {
            let a_dir = a.kind == "DIR" || a.symlink_target_is_dir;
            let b_dir = b.kind == "DIR" || b.symlink_target_is_dir;
            match (a_dir, b_dir) {
                (true, false) => Ordering::Less,
                (false, true) => Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok((normalized, entries))
    }

    pub async fn try_stat(&self, path: &str) -> CoreResult<Option<FileAttributes>> {
        match self.sftp.metadata(path).await {
            Ok(attrs) => Ok(Some(attrs)),
            Err(SftpClientError::Status(status))
                if status.status_code == StatusCode::NoSuchFile =>
            {
                Ok(None)
            }
            Err(err) => Err(map_sftp_error("Failed to stat remote path", err)),
        }
    }

    pub async fn create_dir(&self, parent_dir: &str, name: &str) -> CoreResult<String> {
        let target = join_remote_path(parent_dir, name)?;
        if self.try_stat(&target).await?.is_some() {
            return Err(CoreError::Validation(format!(
                "Destination '{target}' already exists"
            )));
        }
        self.sftp
            .create_dir(&target)
            .await
            .map_err(|e| map_sftp_error("Failed to create remote directory", e))?;
        Ok(target)
    }

    pub async fn create_file(&self, parent_dir: &str, name: &str) -> CoreResult<String> {
        let target = join_remote_path(parent_dir, name)?;
        if self.try_stat(&target).await?.is_some() {
            return Err(CoreError::Validation(format!(
                "Destination '{target}' already exists"
            )));
        }
        let mut file = self
            .sftp
            .open_with_flags(
                &target,
                OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
            )
            .await
            .map_err(|e| map_sftp_error("Failed to create remote file", e))?;
        let _ = file.shutdown().await;
        Ok(target)
    }

    pub async fn rename_entry(&self, old_path: &str, new_name: &str) -> CoreResult<String> {
        let normalized_old = normalize_remote_path(old_path);
        if normalized_old == "/" || is_win_drive_root(&normalized_old) {
            return Err(CoreError::Validation("Cannot rename root '/'".to_string()));
        }
        let valid_name = validate_single_entry_name(new_name)?;
        let parent = parent_remote_path(&normalized_old);
        let new_path = join_remote_path(&parent, valid_name)?;
        if normalized_old == new_path {
            return Ok(new_path);
        }
        if self.try_stat(&new_path).await?.is_some() {
            return Err(CoreError::Validation(format!(
                "Remote path already exists: {new_path}"
            )));
        }
        self.sftp
            .rename(&normalized_old, &new_path)
            .await
            .map_err(|e| map_sftp_error("Failed to rename remote entry", e))?;
        Ok(new_path)
    }

    pub async fn chmod(&self, path: &str, mode: u32) -> CoreResult<()> {
        let valid_mode = validate_octal_mode(mode)?;
        let normalized = normalize_remote_path(path);
        let attrs = FileAttributes {
            permissions: Some(valid_mode),
            ..FileAttributes::empty()
        };
        self.sftp
            .set_metadata(&normalized, attrs)
            .await
            .map_err(|e| map_sftp_error("Failed to update permissions", e))
    }

    pub async fn delete_entries(&self, paths: &[String]) -> CoreResult<()> {
        let mut processed_entries = 0usize;
        for raw in paths {
            let root = normalize_remote_path(raw);
            if root == "/" || is_win_drive_root(&root) {
                return Err(CoreError::Validation("Refusing to delete '/'".to_string()));
            }
            let lstat = self
                .sftp
                .symlink_metadata(&root)
                .await
                .map_err(|e| map_sftp_error("Failed to inspect remote target", e))?;
            if lstat.file_type().is_symlink() || !lstat.file_type().is_dir() {
                self.sftp
                    .remove_file(&root)
                    .await
                    .map_err(|e| map_sftp_error("Failed to remove remote file", e))?;
                continue;
            }

            let mut stack: Vec<(String, usize, bool)> = vec![(root, 0, false)];
            while let Some((dir_path, depth, visited)) = stack.pop() {
                if depth > SFTP_MAX_WALK_DEPTH || processed_entries > SFTP_MAX_WALK_ENTRIES {
                    return Err(CoreError::Sftp(
                        "Failed to remove remote directory: Directory tree exceeds safety limit"
                            .to_string(),
                    ));
                }
                if visited {
                    self.sftp
                        .remove_dir(&dir_path)
                        .await
                        .map_err(|e| map_sftp_error("Failed to remove remote directory", e))?;
                    continue;
                }

                stack.push((dir_path.clone(), depth, true));
                let children = self
                    .sftp
                    .read_dir(&dir_path)
                    .await
                    .map_err(|e| map_sftp_error("Failed to read remote directory", e))?;
                for child in children {
                    let child_name = child.file_name();
                    if child_name == "." || child_name == ".." {
                        continue;
                    }
                    processed_entries += 1;
                    let child_path = join_remote_path(&dir_path, &child_name)?;
                    let ctype = child.file_type();
                    if !ctype.is_symlink() && ctype.is_dir() {
                        stack.push((child_path, depth + 1, false));
                    } else {
                        self.sftp
                            .remove_file(&child_path)
                            .await
                            .map_err(|e| map_sftp_error("Failed to remove remote child", e))?;
                    }
                }
            }
        }
        Ok(())
    }

    pub async fn ensure_remote_dir_all(&self, dir_path: &str) -> CoreResult<()> {
        let normalized = normalize_remote_path(dir_path);
        if normalized == "/" {
            return Ok(());
        }
        let mut current = String::new();
        for segment in normalized.split('/').filter(|s| !s.is_empty()) {
            current.push('/');
            current.push_str(segment);
            match self.try_stat(&current).await? {
                Some(attrs) if attrs.file_type().is_dir() => {}
                Some(_) => {
                    return Err(CoreError::Sftp(format!(
                        "Expected directory at '{current}', found a file"
                    )));
                }
                None => {
                    if let Err(err) = self.sftp.create_dir(&current).await {
                        match self.try_stat(&current).await? {
                            Some(attrs) if attrs.file_type().is_dir() => {}
                            _ => {
                                return Err(map_sftp_error(
                                    "Failed to create remote directory",
                                    err,
                                ))
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

pub fn emit_status(
    app: &AppHandle,
    tab_id: &str,
    host_id: &str,
    state: &str,
    cwd: Option<String>,
    error_message: Option<String>,
) {
    let _ = app.emit(
        EVENT_SFTP_STATUS,
        SftpStatusEventDto {
            tab_id: tab_id.to_string(),
            host_id: host_id.to_string(),
            state: state.to_string(),
            cwd,
            error_message,
        },
    );
}

#[cfg(test)]
mod tests {
    #[test]
    fn skips_dot_and_dotdot_entry_names() {
        let entries = vec![".", "..", "normal_file", "sub_dir"];
        let filtered: Vec<&str> = entries
            .into_iter()
            .filter(|name| *name != "." && *name != "..")
            .collect();
        assert_eq!(filtered, vec!["normal_file", "sub_dir"]);
    }
}
