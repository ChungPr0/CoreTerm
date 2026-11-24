use std::path::PathBuf;

#[cfg(windows)]
use std::ffi::OsString;
#[cfg(windows)]
use std::os::windows::ffi::OsStringExt;

#[cfg(windows)]
use windows_sys::core::GUID;
#[cfg(windows)]
use windows_sys::Win32::System::Com::CoTaskMemFree;
#[cfg(windows)]
use windows_sys::Win32::UI::Shell::{
    FOLDERID_ProgramFiles, FOLDERID_ProgramFilesX86, FOLDERID_System, FOLDERID_Windows,
    SHGetKnownFolderPath,
};

#[cfg(windows)]
use crate::core::path_guard::clean_display_path;

#[cfg(windows)]
pub fn known_folder_path(folder_id: &GUID) -> Option<PathBuf> {
    unsafe {
        let mut raw_ptr: *mut u16 = std::ptr::null_mut();
        let hr = SHGetKnownFolderPath(folder_id, 0, std::ptr::null_mut(), &mut raw_ptr);
        if hr < 0 || raw_ptr.is_null() {
            return None;
        }
        let mut len = 0usize;
        while *raw_ptr.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(raw_ptr, len);
        let os_str = OsString::from_wide(slice);
        CoTaskMemFree(raw_ptr as *const core::ffi::c_void);
        let path = PathBuf::from(os_str);
        if path.as_os_str().is_empty() {
            None
        } else {
            Some(path)
        }
    }
}

#[cfg(windows)]
pub fn system32_dir() -> Option<PathBuf> {
    if let Some(dir) = known_folder_path(&FOLDERID_System) {
        return Some(dir);
    }
    for var in ["SystemRoot", "WINDIR"] {
        if let Some(root) = std::env::var_os(var).filter(|v| !v.is_empty()) {
            let candidate = PathBuf::from(root).join("System32");
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(windows)]
pub fn system32_binary(binary_name: &str) -> PathBuf {
    if let Some(sys32) = system32_dir() {
        let candidate = sys32.join(binary_name);
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from(binary_name)
}

#[cfg(windows)]
pub fn trusted_elevated_shell_roots() -> Vec<PathBuf> {
    let ids = [
        &FOLDERID_System,
        &FOLDERID_Windows,
        &FOLDERID_ProgramFiles,
        &FOLDERID_ProgramFilesX86,
    ];
    let mut roots = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(raw) = known_folder_path(id) {
            let canon = std::fs::canonicalize(&raw).unwrap_or(raw);
            let cleaned = PathBuf::from(clean_display_path(&canon));
            if !roots.contains(&cleaned) {
                roots.push(cleaned);
            }
        }
    }
    roots
}

#[cfg(windows)]
pub fn known_program_files_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for id in [&FOLDERID_ProgramFiles, &FOLDERID_ProgramFilesX86] {
        if let Some(dir) = known_folder_path(id) {
            if !dirs.contains(&dir) {
                dirs.push(dir);
            }
        }
    }
    dirs
}

#[cfg(windows)]
pub fn known_windows_dir() -> Option<PathBuf> {
    known_folder_path(&FOLDERID_Windows)
}

#[cfg(not(windows))]
pub fn system32_dir() -> Option<PathBuf> {
    None
}

#[cfg(not(windows))]
pub fn system32_binary(binary_name: &str) -> PathBuf {
    PathBuf::from(binary_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn resolves_windows_known_folders_and_system32_binaries() {
        let sys32 = system32_dir().expect("FOLDERID_System should resolve on Windows");
        assert!(sys32.is_absolute());
        assert!(sys32.is_dir());

        let roots = trusted_elevated_shell_roots();
        assert!(!roots.is_empty());
        assert!(roots.iter().all(|r| !r.to_string_lossy().starts_with(r"\\?\")));

        let netstat = system32_binary("netstat.exe");
        assert!(netstat.is_absolute());
        assert!(netstat.is_file());

        let tasklist = system32_binary("tasklist.exe");
        assert!(tasklist.is_absolute());
        assert!(tasklist.is_file());
    }
}
