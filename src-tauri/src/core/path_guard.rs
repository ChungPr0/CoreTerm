use std::path::{Path, PathBuf};

use crate::core::error::{CoreError, CoreResult};

const WIN_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$", "COM1", "COM2", "COM3", "COM4",
    "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6",
    "LPT7", "LPT8", "LPT9", "COM¹", "COM²", "COM³", "LPT¹", "LPT²", "LPT³",
];

fn is_win_drive_seg(seg: &str) -> bool {
    let b = seg.as_bytes();
    b.len() == 2 && b[0].is_ascii_alphabetic() && b[1] == b':'
}

pub fn is_win_drive_root(normalized: &str) -> bool {
    let trimmed = normalized.trim_end_matches('/');
    trimmed.starts_with('/') && is_win_drive_seg(&trimmed[1..])
}

pub fn normalize_remote_path(raw: &str) -> String {
    let unified = raw.replace('\\', "/");
    let mut stack: Vec<&str> = Vec::new();
    for seg in unified.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if !(stack.len() == 1 && is_win_drive_seg(stack[0])) {
                    stack.pop();
                }
            }
            s => stack.push(s),
        }
    }
    if stack.is_empty() {
        "/".to_string()
    } else if stack.len() == 1 && is_win_drive_seg(stack[0]) {
        format!("/{}/", stack[0])
    } else {
        format!("/{}", stack.join("/"))
    }
}

pub fn validate_single_entry_name(name: &str) -> CoreResult<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation("Entry name cannot be empty".to_string()));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(CoreError::Validation(format!(
            "Invalid entry name: '{trimmed}'"
        )));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(CoreError::Validation(format!(
            "Entry name cannot contain path separators or null bytes: '{trimmed}'"
        )));
    }
    Ok(trimmed)
}

pub fn validate_windows_file_name(name: &str) -> CoreResult<()> {
    let valid = validate_single_entry_name(name)?;
    if name.ends_with(' ') || name.ends_with('.') || valid.ends_with('.') {
        return Err(CoreError::Validation(format!(
            "Windows filename cannot end with a space or dot: '{name}'"
        )));
    }
    if valid
        .chars()
        .any(|c| (c as u32) < 0x20 || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
    {
        return Err(CoreError::Validation(format!(
            "Filename contains characters disallowed on Windows: '{name}'"
        )));
    }

    let stem = valid.split('.').next().unwrap_or("").to_uppercase();
    if WIN_RESERVED.contains(&stem.as_str()) {
        return Err(CoreError::Validation(format!(
            "Filename uses a reserved Windows device name: '{name}'"
        )));
    }
    Ok(())
}

pub fn join_remote_path(base: &str, name: &str) -> CoreResult<String> {
    let valid = validate_single_entry_name(name)?;
    let normalized = normalize_remote_path(base);
    if normalized.ends_with('/') {
        Ok(format!("{normalized}{valid}"))
    } else {
        Ok(format!("{normalized}/{valid}"))
    }
}

pub fn parent_remote_path(path: &str) -> String {
    let normalized = normalize_remote_path(path);
    if normalized == "/" || is_win_drive_root(&normalized) {
        return normalized;
    }
    match normalized.rsplit_once('/') {
        Some(("", _)) | None => "/".to_string(),
        Some((parent, _)) => {
            if is_win_drive_root(parent) {
                format!("{}/", parent.trim_end_matches('/'))
            } else {
                parent.to_string()
            }
        }
    }
}

pub fn remote_leaf_name(path: &str) -> &str {
    let trimmed = path.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or("")
}

/// Joins untrusted remote relative segments onto a Windows base directory safely.
pub fn safe_join_windows_relative(base_dir: &Path, relative_segments: &[String]) -> CoreResult<PathBuf> {
    let mut target = base_dir.to_path_buf();
    for seg in relative_segments {
        validate_windows_file_name(seg)?;
        target.push(seg);
    }
    Ok(target)
}

pub fn next_numbered_name(file_name: &str, attempt: usize) -> String {
    if let Some(dot_idx) = file_name.rfind('.') {
        if dot_idx > 0 {
            let (stem, ext) = file_name.split_at(dot_idx);
            return format!("{stem} ({attempt}){ext}");
        }
    }
    format!("{file_name} ({attempt})")
}

pub fn validate_octal_mode(mode: u32) -> CoreResult<u32> {
    if mode > 0o7777 {
        return Err(CoreError::Validation(format!(
            "Invalid POSIX mode: {mode:#o} (expected 0000..=7777)"
        )));
    }
    Ok(mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_remote_path() {
        assert_eq!(normalize_remote_path(""), "/");
        assert_eq!(normalize_remote_path("///"), "/");
        assert_eq!(normalize_remote_path("/var/log/../www/./html/"), "/var/www/html");
        assert_eq!(normalize_remote_path("/../../etc"), "/etc");
        assert_eq!(normalize_remote_path("/C:/Users/demo"), "/C:/Users/demo");
        assert_eq!(normalize_remote_path("/C:/"), "/C:/");
        assert_eq!(normalize_remote_path("/C:"), "/C:/");
        assert_eq!(normalize_remote_path("/C:/../.."), "/C:/");
        assert_eq!(join_remote_path("/C:/", "Users").unwrap(), "/C:/Users");
        assert_eq!(parent_remote_path("/C:/Users"), "/C:/");
        assert_eq!(parent_remote_path("/C:/"), "/C:/");
    }

    #[test]
    fn test_safe_join_windows_relative_blocks_traversal_and_reserved() {
        let base = Path::new("C:\\Users\\demo\\Downloads");
        assert!(safe_join_windows_relative(base, &["..".into(), "evil.txt".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["sub/dir".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["CON.txt".into()]).is_err());
        assert!(safe_join_windows_relative(base, &[" CON.txt".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["nul".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["clock$.txt".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["conin$.dat".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["conout$".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["COM¹".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["com¹.log".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["lpt²".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["bad:name".into()]).is_err());
        assert!(safe_join_windows_relative(base, &["trailing.".into()]).is_err());

        let ok = safe_join_windows_relative(base, &["app".into(), "config.json".into()]).unwrap();
        assert_eq!(ok, base.join("app").join("config.json"));
    }

    #[test]
    fn test_next_numbered_name() {
        assert_eq!(next_numbered_name("archive.zip", 1), "archive (1).zip");
        assert_eq!(next_numbered_name(".env", 2), ".env (2)");
        assert_eq!(next_numbered_name("README", 3), "README (3)");
    }

    #[test]
    fn test_validate_octal_mode() {
        assert_eq!(validate_octal_mode(0o755).unwrap(), 0o755);
        assert_eq!(validate_octal_mode(0o4755).unwrap(), 0o4755);
        assert!(validate_octal_mode(0o10000).is_err());
    }
}
