use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;

use tokio_util::sync::CancellationToken;

use super::job::{TransferDirection, TransferJobSpec};
use crate::core::defaults::{SFTP_MAX_WALK_DEPTH, SFTP_MAX_WALK_ENTRIES};
use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::{
    clean_display_path, is_win_drive_root, join_remote_path, normalize_remote_path,
    remote_leaf_name, safe_join_windows_relative, validate_local_download_root,
    validate_local_write_path,
};
use crate::sftp::session::{fmt_sftp_err, RemoteSftpClient};

pub async fn collect_upload_plan(
    client: &RemoteSftpClient,
    local_paths: Vec<String>,
    remote_dir: &str,
    cancel_token: &CancellationToken,
) -> CoreResult<Vec<TransferJobSpec>> {
    let target_root = normalize_remote_path(remote_dir);
    let mut specs = Vec::new();
    let mut visited_count = 0usize;

    for raw_local in local_paths {
        if cancel_token.is_cancelled() {
            return Err(CoreError::Sftp("Connection cancelled".to_string()));
        }
        let root_path = PathBuf::from(raw_local.trim());
        if !root_path.exists() {
            return Err(CoreError::NotFound(format!(
                "Local path does not exist: {}",
                clean_display_path(&root_path)
            )));
        }
        let root_name = root_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|n| !n.is_empty())
            .ok_or_else(|| CoreError::Validation("Cannot upload root directory".to_string()))?;

        if root_path.is_file() {
            let dest_remote = join_remote_path(&target_root, &root_name)?;
            let total = fs::metadata(&root_path)?.len();
            specs.push(TransferJobSpec {
                direction: TransferDirection::Upload,
                source_path: clean_display_path(&root_path),
                dest_path: dest_remote,
                file_name: root_name,
                total_bytes: total,
            });
            continue;
        }

        if root_path.is_dir() {
            let dest_base = join_remote_path(&target_root, &root_name)?;
            client.ensure_remote_dir_all(&dest_base).await?;
            let mut queue: VecDeque<(PathBuf, String, usize)> = VecDeque::new();
            queue.push_back((root_path, dest_base, 0));

            while let Some((cur_local, cur_remote, depth)) = queue.pop_front() {
                if cancel_token.is_cancelled() {
                    return Err(CoreError::Sftp("Connection cancelled".to_string()));
                }
                if depth > SFTP_MAX_WALK_DEPTH || visited_count > SFTP_MAX_WALK_ENTRIES {
                    return Err(CoreError::Validation(
                        "Directory tree exceeds maximum transfer depth or entry limit".to_string(),
                    ));
                }
                for item in fs::read_dir(&cur_local)? {
                    let Ok(entry) = item else { continue };
                    visited_count += 1;
                    let child_name = entry.file_name().to_string_lossy().into_owned();
                    let child_local = entry.path();
                    let Ok(child_meta) = fs::symlink_metadata(&child_local) else {
                        continue;
                    };
                    if child_meta.file_type().is_symlink() {
                        continue;
                    }
                    let Ok(child_remote) = join_remote_path(&cur_remote, &child_name) else {
                        continue;
                    };
                    if child_meta.is_dir() {
                        client.ensure_remote_dir_all(&child_remote).await?;
                        queue.push_back((child_local, child_remote, depth + 1));
                    } else if child_meta.is_file() {
                        specs.push(TransferJobSpec {
                            direction: TransferDirection::Upload,
                            source_path: clean_display_path(&child_local),
                            dest_path: child_remote,
                            file_name: child_name,
                            total_bytes: child_meta.len(),
                        });
                    }
                }
            }
        }
    }

    Ok(specs)
}

fn resolve_validated_download_target(
    local_root: &std::path::Path,
    relative_segments: &[String],
) -> CoreResult<PathBuf> {
    let dest_local = safe_join_windows_relative(local_root, relative_segments)?;
    validate_local_write_path(&dest_local)?;
    Ok(dest_local)
}

pub async fn collect_download_plan(
    client: &RemoteSftpClient,
    remote_paths: Vec<String>,
    local_dir: &str,
    cancel_token: &CancellationToken,
) -> CoreResult<Vec<TransferJobSpec>> {
    let local_root = PathBuf::from(local_dir.trim());
    validate_local_download_root(&local_root)?;
    if !local_root.is_dir() {
        return Err(CoreError::NotFound(format!(
            "Local target directory not found: {}",
            clean_display_path(&local_root)
        )));
    }
    let mut specs = Vec::new();
    let mut visited_count = 0usize;

    for raw_remote in remote_paths {
        if cancel_token.is_cancelled() {
            return Err(CoreError::Sftp("Connection cancelled".to_string()));
        }
        let norm_remote = normalize_remote_path(&raw_remote);
        let attrs = client
            .sftp
            .symlink_metadata(&norm_remote)
            .await
            .map_err(|e| CoreError::Sftp(format!("Stat '{norm_remote}': {}", fmt_sftp_err(&e))))?;

        let leaf = remote_leaf_name(&norm_remote).to_string();
        if leaf.is_empty() || is_win_drive_root(&norm_remote) {
            return Err(CoreError::Validation(
                "Cannot download root '/'".to_string(),
            ));
        }

        if attrs.file_type().is_dir() {
            let mut queue: VecDeque<(String, Vec<String>)> = VecDeque::new();
            let root_segments = vec![leaf];
            let local_subdir = resolve_validated_download_target(&local_root, &root_segments)?;
            fs::create_dir_all(&local_subdir)?;
            queue.push_back((norm_remote, root_segments));

            while let Some((cur_remote, rel_segments)) = queue.pop_front() {
                if cancel_token.is_cancelled() {
                    return Err(CoreError::Sftp("Connection cancelled".to_string()));
                }
                if rel_segments.len() > SFTP_MAX_WALK_DEPTH
                    || visited_count > SFTP_MAX_WALK_ENTRIES
                {
                    return Err(CoreError::Validation(
                        "Directory tree exceeds maximum transfer depth or entry limit".to_string(),
                    ));
                }
                let children = client
                    .sftp
                    .read_dir(&cur_remote)
                    .await
                    .map_err(|e| {
                        CoreError::Sftp(format!("Read '{cur_remote}': {}", fmt_sftp_err(&e)))
                    })?;
                for child in children {
                    let cname = child.file_name();
                    if cname == "." || cname == ".." {
                        continue;
                    }
                    visited_count += 1;
                    if visited_count > SFTP_MAX_WALK_ENTRIES {
                        return Err(CoreError::Validation(
                            "Directory tree exceeds maximum transfer depth or entry limit"
                                .to_string(),
                        ));
                    }
                    let ctype = child.file_type();
                    if ctype.is_symlink() {
                        continue;
                    }
                    let Ok(child_remote) = join_remote_path(&cur_remote, &cname) else {
                        continue;
                    };
                    let mut child_rel = rel_segments.clone();
                    child_rel.push(cname.clone());
                    let dest_local = resolve_validated_download_target(&local_root, &child_rel)?;

                    if ctype.is_dir() {
                        fs::create_dir_all(&dest_local)?;
                        queue.push_back((child_remote, child_rel));
                    } else if ctype.is_file() {
                        specs.push(TransferJobSpec {
                            direction: TransferDirection::Download,
                            source_path: child_remote,
                            dest_path: clean_display_path(&dest_local),
                            file_name: cname,
                            total_bytes: child.metadata().len(),
                        });
                    }
                }
            }
        } else {
            let eff_attrs = if attrs.file_type().is_symlink() {
                client
                    .sftp
                    .metadata(&norm_remote)
                    .await
                    .map_err(|e| {
                        CoreError::Sftp(format!(
                            "Broken symlink '{norm_remote}': {}",
                            fmt_sftp_err(&e)
                        ))
                    })?
            } else {
                attrs
            };
            if eff_attrs.file_type().is_dir() {
                return Err(CoreError::Validation(
                    "Cannot download symlink pointing to a directory directly as a file"
                        .to_string(),
                ));
            }
            let dest_local =
                resolve_validated_download_target(&local_root, std::slice::from_ref(&leaf))?;
            specs.push(TransferJobSpec {
                direction: TransferDirection::Download,
                source_path: norm_remote,
                dest_path: clean_display_path(&dest_local),
                file_name: leaf,
                total_bytes: eff_attrs.len(),
            });
        }
    }

    Ok(specs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn sftp_download_path_validation_blocks_protected_dirs_and_allows_safe_targets() {
        let dir = tempdir().expect("tempdir");
        assert!(validate_local_download_root(dir.path()).is_ok());
        let ok = resolve_validated_download_target(
            dir.path(),
            &["sub".to_string(), "file.txt".to_string()],
        )
        .expect("safe target should pass");
        assert!(ok.ends_with("file.txt"));

        #[cfg(windows)]
        {
            if let Ok(windir) = std::env::var("WINDIR") {
                assert!(validate_local_download_root(std::path::Path::new(&windir)).is_err());
                assert!(resolve_validated_download_target(
                    std::path::Path::new(&windir),
                    &["nested_new".to_string(), "evil.dll".to_string()]
                )
                .is_err());
            }
            if let Ok(appdata) = std::env::var("APPDATA") {
                let app_root = PathBuf::from(appdata).join(crate::core::defaults::APP_NAME);
                assert!(validate_local_download_root(&app_root).is_err());
                assert!(resolve_validated_download_target(
                    &app_root,
                    &["data".to_string(), "app.db".to_string()]
                )
                .is_err());
            }
        }
    }
}
