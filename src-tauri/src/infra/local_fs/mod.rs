use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::core::error::{CoreError, CoreResult};
use crate::core::path_guard::{validate_single_entry_name, validate_windows_file_name};
use crate::ipc::dto::{LocalDriveDto, LocalFsEntryDto};

/// Strips Windows extended-length (`\\?\`) prefixes for UI display.
pub fn clean_display_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        raw.into_owned()
    }
}

pub fn list_drives() -> CoreResult<Vec<LocalDriveDto>> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::GetLogicalDrives;
        let mask = unsafe { GetLogicalDrives() };
        let mut drives = Vec::new();
        for bit in 0..26u8 {
            if (mask & (1 << bit)) != 0 {
                let letter = (b'A' + bit) as char;
                drives.push(LocalDriveDto {
                    name: format!("{letter}:"),
                    path: format!("{letter}:\\"),
                });
            }
        }
        Ok(drives)
    }

    #[cfg(not(windows))]
    {
        Ok(vec![LocalDriveDto {
            name: "/".to_string(),
            path: "/".to_string(),
        }])
    }
}

pub fn default_home_dir() -> String {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let trimmed = profile.trim();
        if !trimmed.is_empty() && Path::new(trimmed).is_dir() {
            return trimmed.to_string();
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() && Path::new(trimmed).is_dir() {
            return trimmed.to_string();
        }
    }
    list_drives()
        .ok()
        .and_then(|mut d| d.drain(..).next().map(|x| x.path))
        .unwrap_or_else(|| if cfg!(windows) { "C:\\" } else { "/" }.to_string())
}

fn system_time_to_ms(t: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    t.ok()
        .and_then(|st| st.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

fn normalize_input_dir(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "~" {
        return PathBuf::from(default_home_dir());
    }
    #[cfg(windows)]
    if trimmed.len() == 2 && trimmed.as_bytes()[1] == b':' {
        return PathBuf::from(format!("{trimmed}\\"));
    }
    PathBuf::from(trimmed)
}

pub fn list_dir(raw_path: &str) -> CoreResult<(String, Vec<LocalFsEntryDto>)> {
    let requested = normalize_input_dir(raw_path);
    let resolved = fs::canonicalize(&requested).unwrap_or_else(|_| requested.clone());
    if !resolved.is_dir() {
        return Err(CoreError::NotFound(format!(
            "Local directory not found: {}",
            clean_display_path(&resolved)
        )));
    }

    let read_dir = fs::read_dir(&resolved)?;
    let mut entries = Vec::new();

    for item in read_dir {
        let Ok(entry) = item else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let entry_path = entry.path();
        let sym_meta = match fs::symlink_metadata(&entry_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_type = sym_meta.file_type();
        let kind = if file_type.is_symlink() {
            "SYMLINK"
        } else if file_type.is_dir() {
            "DIR"
        } else if file_type.is_file() {
            "FILE"
        } else {
            "OTHER"
        };

        // Keep broken symlinks listable instead of failing the whole directory scan.
        let eff_meta = if file_type.is_symlink() {
            fs::metadata(&entry_path).unwrap_or(sym_meta)
        } else {
            sym_meta
        };

        entries.push(LocalFsEntryDto {
            name,
            path: clean_display_path(&entry_path),
            kind: kind.to_string(),
            size: if eff_meta.is_dir() { 0 } else { eff_meta.len() },
            mtime_ms: system_time_to_ms(eff_meta.modified()),
            is_readonly: eff_meta.permissions().readonly(),
        });
    }

    entries.sort_by(|a, b| {
        let a_dir = a.kind == "DIR";
        let b_dir = b.kind == "DIR";
        match (a_dir, b_dir) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok((clean_display_path(&resolved), entries))
}

pub fn create_dir(parent_dir: &str, name: &str) -> CoreResult<String> {
    let valid_name = validate_single_entry_name(name)?;
    validate_windows_file_name(valid_name)?;
    let target = Path::new(parent_dir.trim()).join(valid_name);
    fs::create_dir(&target)?;
    Ok(clean_display_path(&target))
}

fn is_same_local_target(src: &Path, dest: &Path) -> bool {
    #[cfg(windows)]
    {
        src.to_string_lossy().to_lowercase() == dest.to_string_lossy().to_lowercase()
    }
    #[cfg(not(windows))]
    {
        src == dest
    }
}

pub fn rename_entry(old_path: &str, new_name: &str) -> CoreResult<String> {
    let valid_name = validate_single_entry_name(new_name)?;
    validate_windows_file_name(valid_name)?;
    let src = Path::new(old_path.trim());
    let parent = src.parent().ok_or_else(|| {
        CoreError::Validation(format!("Cannot rename root path: {}", src.display()))
    })?;
    let dest = parent.join(valid_name);
    if !is_same_local_target(src, &dest) && dest.exists() {
        return Err(CoreError::Validation(format!(
            "Target already exists: {}",
            clean_display_path(&dest)
        )));
    }
    fs::rename(src, &dest)?;
    Ok(clean_display_path(&dest))
}

pub fn delete_entries(paths: &[String]) -> CoreResult<()> {
    for raw in paths {
        let p = Path::new(raw.trim());
        let meta = fs::symlink_metadata(p)?;
        if meta.file_type().is_symlink() {
            // Unlink the symlink only; remove_dir handles Windows junctions.
            if fs::remove_file(p).is_err() {
                fs::remove_dir(p)?;
            }
        } else if meta.is_dir() {
            fs::remove_dir_all(p)?;
        } else {
            fs::remove_file(p)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rename_allows_case_only_change_but_blocks_existing_sibling() {
        let dir = tempdir().expect("tempdir");
        let a = dir.path().join("readme.txt");
        let b = dir.path().join("other.txt");
        fs::write(&a, b"hi").unwrap();
        fs::write(&b, b"yo").unwrap();

        let renamed = rename_entry(&a.to_string_lossy(), "Readme.txt").expect("case rename");
        assert!(renamed.ends_with("Readme.txt"));

        let conflict = rename_entry(&renamed, "other.txt");
        assert!(conflict.is_err());
    }
}
