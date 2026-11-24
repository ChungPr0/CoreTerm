use std::fs;
use std::path::{Component, Path, PathBuf};

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

fn strip_extended_prefix(path: &Path) -> PathBuf {
    PathBuf::from(clean_display_path(path))
}

fn is_root_or_drive_root(path: &Path) -> bool {
    let cleaned = strip_extended_prefix(path);
    if cleaned.parent().is_none() {
        return true;
    }
    !cleaned
        .components()
        .any(|c| matches!(c, Component::Normal(_)))
}

fn normalized_components(path: &Path) -> Vec<String> {
    let cleaned = strip_extended_prefix(path);
    cleaned
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect()
}

fn path_components_match_or_sub(target: &Path, protected: &Path) -> bool {
    let target_comps = normalized_components(target);
    let prot_comps = normalized_components(protected);

    if target_comps.len() < prot_comps.len() || prot_comps.is_empty() {
        return false;
    }

    target_comps[..prot_comps.len()] == prot_comps[..]
}

fn path_components_equal(target: &Path, other: &Path) -> bool {
    normalized_components(target) == normalized_components(other)
}

fn lexically_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::Prefix(p) => out.push(p.as_os_str()),
            Component::RootDir => out.push(comp.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(seg) => out.push(seg),
        }
    }
    out
}

fn canonicalize_deepest_existing(abs_input: &Path) -> PathBuf {
    let comps: Vec<Component<'_>> = abs_input.components().collect();
    for i in (1..=comps.len()).rev() {
        let mut prefix = PathBuf::new();
        for c in &comps[..i] {
            prefix.push(c.as_os_str());
        }
        if let Ok(canon) = fs::canonicalize(&prefix) {
            let mut resolved = strip_extended_prefix(&canon);
            for rem in &comps[i..] {
                match rem {
                    Component::CurDir => {}
                    Component::ParentDir => {
                        resolved.pop();
                    }
                    Component::Normal(seg) => resolved.push(seg),
                    Component::Prefix(_) | Component::RootDir => {}
                }
            }
            return resolved;
        }
    }

    lexically_normalize(abs_input)
}

/// Canonicalizes `path` if it exists; otherwise walks up ancestors to canonicalize the deepest
/// existing parent and re-joins the remaining normalized path segments with `\\?\` stripped.
fn resolve_target_or_parent(path: &Path) -> PathBuf {
    if let Ok(canon) = fs::canonicalize(path) {
        return strip_extended_prefix(&canon);
    }

    let abs_input = if path.is_absolute() {
        strip_extended_prefix(path)
    } else if let Ok(cwd) = std::env::current_dir() {
        strip_extended_prefix(&cwd).join(path)
    } else {
        strip_extended_prefix(path)
    };

    let has_parent_dir = abs_input
        .components()
        .any(|c| matches!(c, Component::ParentDir));
    let resolved = canonicalize_deepest_existing(&abs_input);
    if has_parent_dir {
        canonicalize_deepest_existing(&resolved)
    } else {
        resolved
    }
}

fn is_user_profile_root_resolved(target: &Path) -> bool {
    #[cfg(windows)]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let trimmed = profile.trim();
            if !trimmed.is_empty() {
                let prof_path = PathBuf::from(trimmed);
                let canon_prof = fs::canonicalize(&prof_path)
                    .map(|p| strip_extended_prefix(&p))
                    .unwrap_or_else(|_| strip_extended_prefix(&prof_path));
                if path_components_equal(target, &canon_prof) {
                    return true;
                }
            }
        }
        false
    }

    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let trimmed = home.trim();
            if !trimmed.is_empty() {
                let home_path = PathBuf::from(trimmed);
                let canon_home = fs::canonicalize(&home_path)
                    .map(|p| strip_extended_prefix(&p))
                    .unwrap_or_else(|_| strip_extended_prefix(&home_path));
                if path_components_equal(target, &canon_home) {
                    return true;
                }
            }
        }
        false
    }
}

fn check_protected_system_and_app_dirs(
    path: &Path,
    target: &Path,
    action_verb: &str,
    allow_user_profile_root: bool,
) -> CoreResult<()> {
    #[cfg(windows)]
    {
        let mut protected_dirs: Vec<PathBuf> =
            crate::infra::os::known_folders::trusted_elevated_shell_roots();
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
                    let canon = fs::canonicalize(&pb)
                        .map(|p| strip_extended_prefix(&p))
                        .unwrap_or_else(|_| strip_extended_prefix(&pb));
                    if !protected_dirs.contains(&canon) {
                        protected_dirs.push(canon);
                    }
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
                let canon_prof = fs::canonicalize(&prof_path)
                    .map(|p| strip_extended_prefix(&p))
                    .unwrap_or_else(|_| strip_extended_prefix(&prof_path));
                if !allow_user_profile_root && path_components_equal(target, &canon_prof) {
                    return Err(CoreError::Validation(format!(
                        "{action_verb} the user profile root directory is strictly prohibited"
                    )));
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
                    let canon_app = fs::canonicalize(&app_dir)
                        .map(|p| strip_extended_prefix(&p))
                        .unwrap_or_else(|_| strip_extended_prefix(&app_dir));
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
            let canon = fs::canonicalize(&pb)
                .map(|p| strip_extended_prefix(&p))
                .unwrap_or_else(|_| strip_extended_prefix(&pb));
            if path_components_match_or_sub(target, &canon) {
                return Err(CoreError::Validation(format!(
                    "{action_verb} protected system path is prohibited: '{}'",
                    clean_display_path(path)
                )));
            }
        }

        if !allow_user_profile_root && is_user_profile_root_resolved(target) {
            return Err(CoreError::Validation(format!(
                "{action_verb} the user profile root directory is strictly prohibited"
            )));
        }
    }

    let _ = allow_user_profile_root;
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

    check_protected_system_and_app_dirs(path, &target, "Deleting", false)
}

/// Guards local file creation, text-editor writes, and SFTP download targets against protected
/// system/application paths, reserved Windows DOS devices, and NTFS alternate data streams.
pub fn validate_local_write_path(path: &Path) -> CoreResult<()> {
    if path.as_os_str().is_empty() {
        return Err(CoreError::Validation(
            "File path cannot be empty".to_string(),
        ));
    }
    if is_root_or_drive_root(path) {
        return Err(CoreError::Validation(format!(
            "Writing protected system path is prohibited: '{}'",
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
            "Writing protected system path is prohibited: '{}'",
            clean_display_path(path)
        )));
    }
    if let Some(target_leaf) = target.file_name().and_then(|s| s.to_str()) {
        validate_windows_file_name(target_leaf)?;
    }

    check_protected_system_and_app_dirs(path, &target, "Writing", false)
}

/// Guards the root local target directory of an SFTP download.
/// Blocks drive roots, protected OS directories, and CoreTerm application data directories,
/// while permitting downloads into the user's home/profile directory.
pub fn validate_local_download_root(path: &Path) -> CoreResult<()> {
    if path.as_os_str().is_empty() {
        return Err(CoreError::Validation(
            "File path cannot be empty".to_string(),
        ));
    }
    if is_root_or_drive_root(path) {
        return Err(CoreError::Validation(format!(
            "Writing protected system path is prohibited: '{}'",
            clean_display_path(path)
        )));
    }

    let target = resolve_target_or_parent(path);
    if is_root_or_drive_root(&target) {
        return Err(CoreError::Validation(format!(
            "Writing protected system path is prohibited: '{}'",
            clean_display_path(path)
        )));
    }
    if is_user_profile_root_resolved(&target) {
        return Ok(());
    }

    validate_local_write_path(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_extended_length_prefixes_before_component_comparison() {
        let normal = Path::new(r"C:\Windows\System32\drivers\etc\hosts");
        let verbatim = Path::new(r"\\?\C:\Windows");
        assert!(path_components_match_or_sub(normal, verbatim));
        assert!(path_components_match_or_sub(
            Path::new(r"\\?\C:\Windows\NonExistent\Sub\file.dll"),
            Path::new(r"C:\Windows")
        ));
        assert!(path_components_equal(
            Path::new(r"\\?\C:\Windows"),
            Path::new(r"c:\windows")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn blocks_nested_non_existent_paths_under_protected_dirs_and_reports_writing_verb() {
        if let Ok(windir) = std::env::var("WINDIR") {
            let nested = Path::new(&windir)
                .join("NonExistentSubdirA")
                .join("NonExistentSubdirB")
                .join("payload.dll");
            let err = validate_local_write_path(&nested)
                .expect_err("nested non-existent path under WINDIR must be blocked");
            let msg = err.to_string();
            assert!(
                msg.contains("Writing protected system path is prohibited"),
                "expected 'Writing...' message, got: {msg}"
            );
            assert!(
                !msg.contains("Deleting"),
                "write validation must not say Deleting: {msg}"
            );

            let traversal = Path::new(&windir)
                .join("NonExistent")
                .join("..")
                .join("System32")
                .join("deep")
                .join("evil.exe");
            assert!(validate_local_write_path(&traversal).is_err());

            assert!(validate_local_download_root(Path::new(&windir)).is_err());
        }

        if let Ok(appdata) = std::env::var("APPDATA") {
            let nested_app = Path::new(&appdata)
                .join(APP_NAME)
                .join("new_dir")
                .join("sub_dir")
                .join("evil.db");
            let err = validate_local_write_path(&nested_app)
                .expect_err("nested path under CoreTerm app data must be blocked");
            assert!(err
                .to_string()
                .contains("Writing application data directory is prohibited"));
            assert!(validate_local_download_root(&Path::new(&appdata).join(APP_NAME)).is_err());
        }

        let root_err = validate_local_write_path(Path::new(r"C:\")).unwrap_err();
        assert!(root_err
            .to_string()
            .contains("Writing protected system path is prohibited"));
        assert!(validate_local_download_root(Path::new(r"C:\")).is_err());

        if let Ok(profile) = std::env::var("USERPROFILE") {
            assert!(validate_local_download_root(Path::new(&profile)).is_ok());
            assert!(validate_local_write_path(Path::new(&profile)).is_err());
        }
    }
}
