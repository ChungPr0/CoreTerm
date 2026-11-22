use std::cmp::Ordering;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::core::error::{CoreError, CoreResult};
pub use crate::core::path_guard::{
    clean_display_path, validate_delete_path, validate_local_write_path,
};
use crate::core::path_guard::{validate_single_entry_name, validate_windows_file_name};
use crate::core::text_guard::{
    decode_editable_utf8, validate_editable_size, MAX_EDITABLE_FILE_BYTES,
};
use crate::ipc::dto::{FileContentDto, FileWriteResultDto, LocalDriveDto, LocalFsEntryDto};

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
    validate_windows_file_name(name)?;
    let parent = Path::new(parent_dir.trim());
    if parent_dir.trim().is_empty() || !parent.is_dir() {
        return Err(CoreError::NotFound(format!(
            "Local directory not found: {}",
            clean_display_path(parent)
        )));
    }
    let target = parent.join(valid_name);
    validate_local_write_path(&target)?;
    if target.exists() {
        return Err(CoreError::Validation(format!(
            "Destination '{}' already exists",
            clean_display_path(&target)
        )));
    }
    fs::create_dir(&target)?;
    Ok(clean_display_path(&target))
}

pub fn create_file(parent_dir: &str, name: &str) -> CoreResult<String> {
    let valid_name = validate_single_entry_name(name)?;
    validate_windows_file_name(name)?;
    let parent = Path::new(parent_dir.trim());
    if parent_dir.trim().is_empty() || !parent.is_dir() {
        return Err(CoreError::NotFound(format!(
            "Local directory not found: {}",
            clean_display_path(parent)
        )));
    }
    let target = parent.join(valid_name);
    validate_local_write_path(&target)?;
    if target.exists() {
        return Err(CoreError::Validation(format!(
            "Destination '{}' already exists",
            clean_display_path(&target)
        )));
    }
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)?;
    Ok(clean_display_path(&target))
}

pub fn read_text_file(raw_path: &str) -> CoreResult<FileContentDto> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "File path cannot be empty".to_string(),
        ));
    }
    let path = Path::new(trimmed);
    if let Some(leaf) = path.file_name().and_then(|s| s.to_str()) {
        validate_windows_file_name(leaf)?;
    }
    let pre_meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Err(CoreError::NotFound(format!(
                "Local path not found: {}",
                clean_display_path(path)
            )));
        }
        Err(err) => return Err(CoreError::Io(err)),
    };
    if pre_meta.is_dir() {
        return Err(CoreError::Validation("Cannot edit a directory".to_string()));
    }
    if !pre_meta.is_file() {
        return Err(CoreError::Validation(
            "Binary or non-UTF-8 file cannot be edited".to_string(),
        ));
    }
    validate_editable_size(pre_meta.len())?;

    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Err(CoreError::NotFound(format!(
                "Local path not found: {}",
                clean_display_path(path)
            )));
        }
        Err(err) => return Err(CoreError::Io(err)),
    };
    let meta = file.metadata()?;
    if meta.is_dir() {
        return Err(CoreError::Validation("Cannot edit a directory".to_string()));
    }
    if !meta.is_file() {
        return Err(CoreError::Validation(
            "Binary or non-UTF-8 file cannot be edited".to_string(),
        ));
    }
    validate_editable_size(meta.len())?;

    let mut bytes = Vec::with_capacity((meta.len() as usize).min(65536));
    file.take(MAX_EDITABLE_FILE_BYTES + 1)
        .read_to_end(&mut bytes)?;

    let size = bytes.len() as u64;
    let content = decode_editable_utf8(bytes)?;
    Ok(FileContentDto {
        path: clean_display_path(path),
        content,
        size,
        mtime_ms: system_time_to_ms(meta.modified()),
        readonly: meta.permissions().readonly(),
    })
}

pub fn write_text_file(raw_path: &str, content: &str) -> CoreResult<FileWriteResultDto> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "File path cannot be empty".to_string(),
        ));
    }
    let path = Path::new(trimmed);
    if path.is_dir() {
        return Err(CoreError::Validation("Cannot edit a directory".to_string()));
    }
    validate_local_write_path(path)?;
    validate_editable_size(content.len() as u64)?;

    let resolved = if path.exists() {
        fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
    } else {
        path.to_path_buf()
    };
    if resolved.is_dir() {
        return Err(CoreError::Validation("Cannot edit a directory".to_string()));
    }
    validate_local_write_path(&resolved)?;

    // Write via a sibling temp file and rename atomically when possible to prevent truncation on error.
    let wrote_atomically = if let Some(parent) = resolved.parent() {
        let tmp_name = format!(".coreterm-write-{}.tmp", uuid::Uuid::new_v4());
        let tmp_path = parent.join(tmp_name);
        match fs::write(&tmp_path, content.as_bytes()) {
            Ok(()) => match fs::rename(&tmp_path, &resolved) {
                Ok(()) => true,
                Err(_) => {
                    let _ = fs::remove_file(&tmp_path);
                    false
                }
            },
            Err(_) => {
                let _ = fs::remove_file(&tmp_path);
                false
            }
        }
    } else {
        false
    };

    if !wrote_atomically {
        fs::write(&resolved, content.as_bytes())?;
    }

    let meta = fs::metadata(path).ok();
    Ok(FileWriteResultDto {
        path: clean_display_path(path),
        size: meta.as_ref().map(|m| m.len()).unwrap_or(content.len() as u64),
        mtime_ms: meta.and_then(|m| system_time_to_ms(m.modified())),
    })
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
    validate_windows_file_name(new_name)?;
    let src = Path::new(old_path.trim());
    validate_local_write_path(src)?;
    let parent = src.parent().ok_or_else(|| {
        CoreError::Validation(format!("Cannot rename root path: {}", src.display()))
    })?;
    let dest = parent.join(valid_name);
    validate_local_write_path(&dest)?;
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
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(CoreError::Validation(
                "Path to delete cannot be empty".to_string(),
            ));
        }
        let p = Path::new(trimmed);
        validate_delete_path(p)?;

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

    #[test]
    fn test_validate_delete_and_write_path_blocks_roots_and_system_dirs() {
        assert!(validate_delete_path(Path::new("")).is_err());
        assert!(validate_local_write_path(Path::new("")).is_err());
        #[cfg(windows)]
        {
            assert!(validate_delete_path(Path::new("C:\\")).is_err());
            assert!(validate_delete_path(Path::new("c:/")).is_err());
            assert!(validate_local_write_path(Path::new("C:\\")).is_err());
            if let Ok(windir) = std::env::var("WINDIR") {
                assert!(validate_delete_path(Path::new(&windir)).is_err());
                assert!(validate_delete_path(&Path::new(&windir).join("System32")).is_err());
                assert!(validate_local_write_path(&Path::new(&windir).join("win.ini")).is_err());
            }
            if let Ok(profile) = std::env::var("USERPROFILE") {
                assert!(validate_delete_path(Path::new(&profile)).is_err());
                if let Some(parent) = Path::new(&profile).parent() {
                    assert!(validate_delete_path(parent).is_err());
                }
            }
        }
    }

    #[test]
    fn test_delete_entries_allows_safe_files_in_tempdir() {
        let dir = tempdir().expect("tempdir");
        let a = dir.path().join("safe_delete_file.txt");
        fs::write(&a, b"delete me").unwrap();
        assert!(delete_entries(&[a.to_string_lossy().to_string()]).is_ok());
        assert!(!a.exists());
    }

    #[test]
    fn test_create_read_write_text_file_and_guards() {
        let dir = tempdir().expect("tempdir");
        let created = create_file(&dir.path().to_string_lossy(), "notes.conf").expect("create");
        assert!(Path::new(&created).is_file());
        assert!(create_file(&dir.path().to_string_lossy(), "notes.conf").is_err());
        assert!(create_file(&dir.path().to_string_lossy(), "CON .txt").is_err());

        let wrote = write_text_file(&created, "server_name example.com;\n").expect("write");
        assert_eq!(wrote.size, "server_name example.com;\n".len() as u64);

        let read = read_text_file(&created).expect("read");
        assert_eq!(read.content, "server_name example.com;\n");
        assert!(!read.readonly);

        let bin = dir.path().join("bin.dat");
        fs::write(&bin, b"\x89PNG\r\n\x1a\n\x00\x00").unwrap();
        assert!(read_text_file(&bin.to_string_lossy()).is_err());

        assert!(read_text_file(&dir.path().to_string_lossy()).is_err());
    }
}
