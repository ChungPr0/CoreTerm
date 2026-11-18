#[cfg(windows)]
use std::env::current_exe;
#[cfg(windows)]
use windows_sys::Win32::Foundation::ERROR_SUCCESS;
#[cfg(windows)]
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteTreeW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY, HKEY_CURRENT_USER, KEY_ALL_ACCESS, KEY_READ, REG_OPTION_NON_VOLATILE, REG_SZ,
};

#[cfg(windows)]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
const KEY_DIR_SHELL: &str = "Software\\Classes\\Directory\\shell\\CoreTerm";
#[cfg(windows)]
const KEY_BG_SHELL: &str = "Software\\Classes\\Directory\\Background\\shell\\CoreTerm";
const MENU_TITLE: &str = "Open in CoreTerm";

#[cfg(windows)]
fn set_registry_string(hkey: HKEY, name: Option<&str>, val: &str) -> Result<(), String> {
    let wide_val = to_wide_null(val);
    let byte_len = (wide_val.len() * std::mem::size_of::<u16>()) as u32;
    let name_wide = name.map(to_wide_null);
    let name_ptr = name_wide.as_ref().map_or(std::ptr::null(), |v| v.as_ptr());

    let status = unsafe {
        RegSetValueExW(
            hkey,
            name_ptr,
            0,
            REG_SZ,
            wide_val.as_ptr() as *const u8,
            byte_len,
        )
    };
    if status == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(format!("RegSetValueExW failed with code {status}"))
    }
}

#[cfg(windows)]
fn register_single_shell_key(base_path: &str, exe_path: &str) -> Result<(), String> {
    let wide_base = to_wide_null(base_path);
    let mut hkey: HKEY = std::ptr::null_mut();
    let res = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide_base.as_ptr(),
            0,
            std::ptr::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            std::ptr::null(),
            &mut hkey,
            std::ptr::null_mut(),
        )
    };
    if res != ERROR_SUCCESS || hkey.is_null() {
        return Err(format!("RegCreateKeyExW for {base_path} failed with code {res}"));
    }

    let _ = set_registry_string(hkey, None, MENU_TITLE);
    let icon_val = format!("\"{exe_path}\",0");
    let _ = set_registry_string(hkey, Some("Icon"), &icon_val);
    unsafe { RegCloseKey(hkey) };

    // Create command subkey
    let cmd_path = format!("{base_path}\\command");
    let wide_cmd = to_wide_null(&cmd_path);
    let mut hcmd: HKEY = std::ptr::null_mut();
    let res = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            wide_cmd.as_ptr(),
            0,
            std::ptr::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            std::ptr::null(),
            &mut hcmd,
            std::ptr::null_mut(),
        )
    };
    if res != ERROR_SUCCESS || hcmd.is_null() {
        return Err(format!("RegCreateKeyExW for {cmd_path} failed with code {res}"));
    }

    let cmd_val = format!("\"{exe_path}\" \"%V\"");
    let set_res = set_registry_string(hcmd, None, &cmd_val);
    unsafe { RegCloseKey(hcmd) };
    set_res
}

#[cfg(windows)]
pub fn is_context_menu_registered() -> bool {
    let cmd_path = format!("{KEY_DIR_SHELL}\\command");
    let wide_cmd = to_wide_null(&cmd_path);
    let mut hkey: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide_cmd.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if status != ERROR_SUCCESS || hkey.is_null() {
        return false;
    }
    unsafe { RegCloseKey(hkey) };
    true
}

#[cfg(not(windows))]
pub fn is_context_menu_registered() -> bool {
    false
}

#[cfg(windows)]
pub fn register_context_menu() -> Result<(), String> {
    let exe = current_exe().map_err(|e| format!("Failed to get current executable path: {e}"))?;
    let exe_str = exe.to_string_lossy().to_string();

    register_single_shell_key(KEY_DIR_SHELL, &exe_str)?;
    register_single_shell_key(KEY_BG_SHELL, &exe_str)?;
    Ok(())
}

#[cfg(not(windows))]
pub fn register_context_menu() -> Result<(), String> {
    Err("Context menu registration is only supported on Windows".to_string())
}

#[cfg(windows)]
pub fn unregister_context_menu() -> Result<(), String> {
    unsafe {
        let wide_dir = to_wide_null(KEY_DIR_SHELL);
        let _ = RegDeleteTreeW(HKEY_CURRENT_USER, wide_dir.as_ptr());
        let wide_bg = to_wide_null(KEY_BG_SHELL);
        let _ = RegDeleteTreeW(HKEY_CURRENT_USER, wide_bg.as_ptr());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn unregister_context_menu() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn is_installed_version() -> bool {
    let Ok(exe) = current_exe() else { return false };
    let exe_name = exe.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    if exe_name.contains("portable") {
        return false;
    }
    let exe_str = exe.to_string_lossy().to_lowercase();
    if let Some(parent) = exe.parent() {
        if parent.join("Uninstall CoreTerm.exe").exists()
            || parent.join("uninstall.exe").exists()
        {
            return true;
        }
    }
    if let Ok(prog_files) = std::env::var("ProgramFiles") {
        if exe_str.starts_with(&prog_files.to_lowercase()) {
            return true;
        }
    }
    if let Ok(prog_files_x86) = std::env::var("ProgramFiles(x86)") {
        if exe_str.starts_with(&prog_files_x86.to_lowercase()) {
            return true;
        }
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let programs = format!("{}\\programs\\", local_app_data.to_lowercase());
        if exe_str.starts_with(&programs) {
            return true;
        }
    }
    false
}

/// Auto-heals / updates context menu if the user moved the executable,
/// or auto-enables for installer versions (NSIS setup / MSI).
#[cfg(windows)]
pub fn sync_context_menu_if_enabled() {
    if !is_context_menu_registered() {
        if is_installed_version() {
            let _ = register_context_menu();
        }
        return;
    }
    // Read command string and compare with current_exe
    let cmd_path = format!("{KEY_DIR_SHELL}\\command");
    let wide_cmd = to_wide_null(&cmd_path);
    let mut hkey: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            wide_cmd.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        )
    };
    if status != ERROR_SUCCESS || hkey.is_null() {
        return;
    }

    let mut buf = [0u16; 1024];
    let mut len = (buf.len() * std::mem::size_of::<u16>()) as u32;
    let res = unsafe {
        RegQueryValueExW(
            hkey,
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut u8,
            &mut len,
        )
    };
    unsafe { RegCloseKey(hkey) };

    if res == ERROR_SUCCESS {
        let u16_slice = &buf[..(len as usize / std::mem::size_of::<u16>())];
        let current_reg_val = String::from_utf16_lossy(u16_slice)
            .trim_matches('\0')
            .to_string();
        if let Ok(exe) = current_exe() {
            let exe_str = exe.to_string_lossy();
            if !current_reg_val.contains(&*exe_str) {
                // Moved portable exe! Re-register cleanly
                let _ = register_context_menu();
            }
        }
    }
}

#[cfg(not(windows))]
pub fn sync_context_menu_if_enabled() {}
