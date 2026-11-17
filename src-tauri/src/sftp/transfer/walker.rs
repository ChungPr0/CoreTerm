use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;

use super::job::{TransferDirection, TransferJobSpec};
use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::{
    is_win_drive_root, join_remote_path, normalize_remote_path, remote_leaf_name,
    safe_join_windows_relative,
};
use crate::infra::local_fs::clean_display_path;
use crate::sftp::session::{fmt_sftp_err, RemoteSftpClient};

pub async fn collect_upload_plan(
    client: &RemoteSftpClient,
    local_paths: Vec<String>,
    remote_dir: &str,
) -> CoreResult<Vec<TransferJobSpec>> {
    let target_root = normalize_remote_path(remote_dir);
    let mut specs = Vec::new();

    for raw_local in local_paths {
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
            let mut queue: VecDeque<(PathBuf, String)> = VecDeque::new();
            queue.push_back((root_path, dest_base));

            while let Some((cur_local, cur_remote)) = queue.pop_front() {
                for item in fs::read_dir(&cur_local)? {
                    let Ok(entry) = item else { continue };
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
                        queue.push_back((child_local, child_remote));
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

pub async fn collect_download_plan(
    client: &RemoteSftpClient,
    remote_paths: Vec<String>,
    local_dir: &str,
) -> CoreResult<Vec<TransferJobSpec>> {
    let local_root = PathBuf::from(local_dir.trim());
    if !local_root.is_dir() {
        return Err(CoreError::NotFound(format!(
            "Local target directory not found: {}",
            clean_display_path(&local_root)
        )));
    }
    let mut specs = Vec::new();

    for raw_remote in remote_paths {
        let norm_remote = normalize_remote_path(&raw_remote);
        let attrs = client
            .sftp
            .symlink_metadata(&norm_remote)
            .await
            .map_err(|e| CoreError::Sftp(format!("Stat '{norm_remote}': {}", fmt_sftp_err(&e))))?;

        let leaf = remote_leaf_name(&norm_remote).to_string();
        if leaf.is_empty() || is_win_drive_root(&norm_remote) {
            return Err(CoreError::Validation("Cannot download root '/'".to_string()));
        }

        if attrs.file_type().is_dir() {
            let mut queue: VecDeque<(String, Vec<String>)> = VecDeque::new();
            let root_segments = vec![leaf];
            let local_subdir = safe_join_windows_relative(&local_root, &root_segments)?;
            fs::create_dir_all(&local_subdir)?;
            queue.push_back((norm_remote, root_segments));

            while let Some((cur_remote, rel_segments)) = queue.pop_front() {
                let children = client
                    .sftp
                    .read_dir(&cur_remote)
                    .await
                    .map_err(|e| CoreError::Sftp(format!("Read '{cur_remote}': {}", fmt_sftp_err(&e))))?;
                for child in children {
                    let cname = child.file_name();
                    if cname == "." || cname == ".." {
                        continue;
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
                    let dest_local = safe_join_windows_relative(&local_root, &child_rel)?;

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
            // Allow downloading regular files and symlinks that resolve to regular files.
            let eff_attrs = if attrs.file_type().is_symlink() {
                client
                    .sftp
                    .metadata(&norm_remote)
                    .await
                    .map_err(|e| CoreError::Sftp(format!("Broken symlink '{norm_remote}': {}", fmt_sftp_err(&e))))?
            } else {
                attrs
            };
            if eff_attrs.file_type().is_dir() {
                return Err(CoreError::Validation(
                    "Cannot download symlink pointing to a directory directly as a file".to_string(),
                ));
            }
            let dest_local = safe_join_windows_relative(&local_root, std::slice::from_ref(&leaf))?;
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
