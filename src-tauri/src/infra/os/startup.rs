#[cfg(windows)]
use std::env::current_exe;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
#[cfg(windows)]
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
};

#[cfg(windows)]
const RUN_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(windows)]
const RUN_VALUE_NAME: &str = "CoreTerm";

#[cfg(windows)]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub(crate) fn expected_startup_command(exe_str: &str) -> String {
    format!("\"{exe_str}\"")
}

pub(crate) fn is_unc_or_network_path(path: &std::path::Path) -> bool {
    let cleaned = crate::core::path_guard::clean_display_path(path);
    cleaned.starts_with(r"\\") || cleaned.starts_with("//")
}

#[cfg(windows)]
fn get_registered_startup_command() -> Option<String> {
    let wide_path = to_wide_null(RUN_KEY_PATH);
    let mut hkey: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide_path.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if status != ERROR_SUCCESS || hkey.is_null() {
        return None;
    }

    let wide_name = to_wide_null(RUN_VALUE_NAME);
    let mut buf = [0u16; 1024];
    let mut len = (buf.len() * std::mem::size_of::<u16>()) as u32;
    let res = unsafe {
        RegQueryValueExW(
            hkey,
            wide_name.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut u8,
            &mut len,
        )
    };
    unsafe { RegCloseKey(hkey) };

    if res != ERROR_SUCCESS || len == 0 {
        return None;
    }
    let u16_slice = &buf[..(len as usize / std::mem::size_of::<u16>())];
    let val = String::from_utf16_lossy(u16_slice)
        .trim_matches('\0')
        .trim()
        .to_string();
    if val.is_empty() {
        None
    } else {
        Some(val)
    }
}

#[cfg(windows)]
pub fn is_startup_registered() -> bool {
    get_registered_startup_command().is_some()
}

#[cfg(not(windows))]
pub fn is_startup_registered() -> bool {
    false
}

#[cfg(windows)]
pub fn register_startup() -> Result<(), String> {
    #[allow(unused_mut)]
    let mut exe = current_exe().map_err(|e| format!("Failed to get current executable path: {e}"))?;

    #[cfg(debug_assertions)]
    {
        // Debug builds depend on Vite dev server (localhost:1420), so never register target\debug.
        if let Some(parent) = exe.parent() {
            if parent.ends_with("debug") {
                if let Some(rel_dir) = parent.parent().map(|p| p.join("release")) {
                    let rel_exe = rel_dir.join("coreterm.exe");
                    if rel_exe.exists() {
                        exe = rel_exe;
                    } else {
                        return Err(
                            "Cannot register debug executable to Windows startup because it requires the Vite dev server (localhost:1420). Please build release first (npm run build && npm run tauri build).".to_string()
                        );
                    }
                }
            }
        }
    }

    if is_unc_or_network_path(&exe) {
        return Err("Cannot register network or UNC executable to Windows startup.".to_string());
    }

    let wide_path = to_wide_null(RUN_KEY_PATH);
    let mut hkey: HKEY = std::ptr::null_mut();
    let res = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide_path.as_ptr(),
            0,
            std::ptr::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut hkey,
            std::ptr::null_mut(),
        )
    };
    if res != ERROR_SUCCESS || hkey.is_null() {
        return Err(format!("RegCreateKeyExW failed with code {res}"));
    }

    let exe_str = exe.to_string_lossy();
    let val = expected_startup_command(&exe_str);
    let wide_val = to_wide_null(&val);
    let byte_len = (wide_val.len() * std::mem::size_of::<u16>()) as u32;
    let wide_name = to_wide_null(RUN_VALUE_NAME);
    let status = unsafe {
        RegSetValueExW(
            hkey,
            wide_name.as_ptr(),
            0,
            REG_SZ,
            wide_val.as_ptr() as *const u8,
            byte_len,
        )
    };
    unsafe { RegCloseKey(hkey) };

    if status == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(format!("RegSetValueExW failed with code {status}"))
    }
}

#[cfg(not(windows))]
pub fn register_startup() -> Result<(), String> {
    Err("Windows startup registration is only supported on Windows".to_string())
}

#[cfg(windows)]
pub fn unregister_startup() -> Result<(), String> {
    let wide_path = to_wide_null(RUN_KEY_PATH);
    let mut hkey: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide_path.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok(());
    }
    if status != ERROR_SUCCESS || hkey.is_null() {
        return Err(format!("RegOpenKeyExW failed with code {status}"));
    }

    let wide_name = to_wide_null(RUN_VALUE_NAME);
    let del_status = unsafe { RegDeleteValueW(hkey, wide_name.as_ptr()) };
    unsafe { RegCloseKey(hkey) };

    if del_status == ERROR_SUCCESS || del_status == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(format!("RegDeleteValueW failed with code {del_status}"))
    }
}

#[cfg(not(windows))]
pub fn unregister_startup() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn sync_startup_if_enabled() {
    let Some(registered_cmd) = get_registered_startup_command() else {
        return;
    };

    #[cfg(debug_assertions)]
    {
        if (registered_cmd.contains(r"\target\debug\") || registered_cmd.contains("/target/debug/"))
            && register_startup().is_err()
        {
            let _ = unregister_startup();
        }
    }

    #[cfg(not(debug_assertions))]
    {
        if !crate::infra::os::context_menu::is_installed_version() {
            return;
        }
        if let Ok(exe) = current_exe() {
            let exe_str = exe.to_string_lossy();
            let expected = expected_startup_command(&exe_str);
            if !registered_cmd.eq_ignore_ascii_case(&expected) {
                let _ = register_startup();
            }
        }
    }
}

#[cfg(not(windows))]
pub fn sync_startup_if_enabled() {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn builds_exact_quoted_startup_command_and_detects_network_paths() {
        let expected = expected_startup_command(r"C:\Program Files\CoreTerm\coreterm.exe");
        assert_eq!(expected, r#""C:\Program Files\CoreTerm\coreterm.exe""#);
        assert!(expected.eq_ignore_ascii_case(r#""c:\program files\coreterm\coreterm.exe""#));
        assert!(
            !r#""C:\Program Files\CoreTerm\coreterm.exe" --injected"#
                .eq_ignore_ascii_case(&expected)
        );

        assert!(is_unc_or_network_path(Path::new(
            r"\\fileserver\share\coreterm.exe"
        )));
        assert!(is_unc_or_network_path(Path::new(
            r"\\?\UNC\fileserver\share\coreterm.exe"
        )));
        assert!(!is_unc_or_network_path(Path::new(
            r"C:\Program Files\CoreTerm\coreterm.exe"
        )));
    }
}
