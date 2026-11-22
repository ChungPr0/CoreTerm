use std::fs;
use std::path::{Path, PathBuf};

use crate::core::defaults::APP_NAME;
use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::validate_windows_file_name;

/// Strips Windows extended-length (`\\?\` or `\\?\UNC\`) prefixes for UI and shell display.
pub fn clean_display_path(path: &Path) -> String {
    clean_display_path_str(&path.to_string_lossy())
}

pub fn clean_display_path_str(raw: &str) -> String {
    if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        raw.to_string()
    }
}

fn is_root_or_drive_root(path: &Path) -> bool {
    if path.parent().is_none() {
        return true;
    }
    !path
        .components()
        .any(|c| matches!(c, std::path::Component::Normal(_)))
}

fn path_components_match_or_sub(target: &Path, protected: &Path) -> bool {
    let target_comps: Vec<_> = target
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let prot_comps: Vec<_> = protected
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();

    if target_comps.len() < prot_comps.len() || prot_comps.is_empty() {
        return false;
    }

    target_comps[..prot_comps.len()] == prot_comps[..]
}

fn path_components_equal(target: &Path, other: &Path) -> bool {
    let target_comps: Vec<_> = target
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let other_comps: Vec<_> = other
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    target_comps == other_comps
}

fn resolve_target_or_parent(path: &Path) -> PathBuf {
    if let Ok(canon) = fs::canonicalize(path) {
        return canon;
    }
    if let (Some(parent), Some(leaf)) = (path.parent(), path.file_name()) {
        if let Ok(canon_parent) = fs::canonicalize(parent) {
            return canon_parent.join(leaf);
        }
    }
    path.to_path_buf()
}

fn check_protected_system_and_app_dirs(path: &Path, target: &Path, action_verb: &str) -> CoreResult<()> {
    #[cfg(windows)]
    {
        let mut protected_dirs: Vec<PathBuf> = Vec::new();
        for env_var in &[
            "WINDIR",
            "SystemRoot",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramData",
        ] {
            if let Ok(val) = std::env::var(env_var) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    let pb = PathBuf::from(trimmed);
                    let canon = fs::canonicalize(&pb).unwrap_or(pb);
                    protected_dirs.push(canon);
                }
            }
        }

        for prot in &protected_dirs {
            if path_components_match_or_sub(target, prot) {
                return Err(CoreError::Validation(format!(
                    "{action_verb} protected system path is prohibited: '{}'",
                    clean_display_path(path)
                )));
            }
        }

        if let Ok(profile) = std::env::var("USERPROFILE") {
            let trimmed = profile.trim();
            if !trimmed.is_empty() {
                let prof_path = PathBuf::from(trimmed);
                let canon_prof = fs::canonicalize(&prof_path).unwrap_or(prof_path);
                if path_components_equal(target, &canon_prof) {
                    return Err(CoreError::Validation(
                        "Deleting the user profile root directory is strictly prohibited"
                            .to_string(),
                    ));
                }
                if let Some(prof_parent) = canon_prof.parent() {
                    if path_components_equal(target, prof_parent) {
                        return Err(CoreError::Validation(format!(
                            "{action_verb} protected system path is prohibited: '{}'",
                            clean_display_path(path)
                        )));
                    }
                }
            }
        }

        for env_var in &["APPDATA", "LOCALAPPDATA"] {
            if let Ok(val) = std::env::var(env_var) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    let app_dir = PathBuf::from(trimmed).join(APP_NAME);
                    let canon_app = fs::canonicalize(&app_dir).unwrap_or(app_dir);
                    if path_components_match_or_sub(target, &canon_app) {
                        return Err(CoreError::Validation(format!(
                            "{action_verb} application data directory is prohibited: '{}'",
                            clean_display_path(path)
                        )));
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let unix_system_roots = [
            "/etc", "/bin", "/sbin", "/usr", "/lib", "/lib32", "/lib64", "/var", "/boot", "/dev",
            "/proc", "/sys", "/opt", "/root",
        ];
        for root in &unix_system_roots {
            let pb = PathBuf::from(root);
            let canon = fs::canonicalize(&pb).unwrap_or(pb);
            if path_components_match_or_sub(target, &canon) {
                return Err(CoreError::Validation(format!(
                    "{action_verb} protected system path is prohibited: '{}'",
                    clean_display_path(path)
                )));
            }
        }

        if let Ok(home) = std::env::var("HOME") {
            let trimmed = home.trim();
            if !trimmed.is_empty() {
                let home_path = PathBuf::from(trimmed);
                let canon_home = fs::canonicalize(&home_path).unwrap_or(home_path);
                if path_components_equal(target, &canon_home) {
                    return Err(CoreError::Validation(
                        "Deleting the user profile root directory is strictly prohibited"
                            .to_string(),
                    ));
                }
            }
        }
    }

    Ok(())
}

pub fn validate_delete_path(path: &Path) -> CoreResult<()> {
    if path.as_os_str().is_empty() {
        return Err(CoreError::Validation(
            "Path to delete cannot be empty".to_string(),
        ));
    }

    if is_root_or_drive_root(path) {
        return Err(CoreError::Validation(format!(
            "Deleting drive or root path is strictly prohibited: '{}'",
            clean_display_path(path)
        )));
    }

    let target = resolve_target_or_parent(path);
    if is_root_or_drive_root(&target) {
        return Err(CoreError::Validation(format!(
            "Deleting drive or root path is strictly prohibited: '{}'",
            clean_display_path(path)
        )));
    }

    check_protected_system_and_app_dirs(path, &target, "Deleting")
}

/// Guards local file creation and text-editor writes against protected system/application paths,
/// reserved Windows DOS devices, and NTFS alternate data streams.
pub fn validate_local_write_path(path: &Path) -> CoreResult<()> {
    if path.as_os_str().is_empty() {
        return Err(CoreError::Validation(
            "File path cannot be empty".to_string(),
        ));
    }
    if is_root_or_drive_root(path) {
        return Err(CoreError::Validation(format!(
            "Deleting protected system path is prohibited: '{}'",
            clean_display_path(path)
        )));
    }

    let leaf = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| CoreError::Validation("File path cannot be empty".to_string()))?;
    validate_windows_file_name(leaf)?;

    let target = resolve_target_or_parent(path);
    if is_root_or_drive_root(&target) {
        return Err(CoreError::Validation(format!(
            "Deleting protected system path is prohibited: '{}'",
            clean_display_path(path)
        )));
    }
    if let Some(target_leaf) = target.file_name().and_then(|s| s.to_str()) {
        validate_windows_file_name(target_leaf)?;
    }

    check_protected_system_and_app_dirs(path, &target, "Deleting")
}
