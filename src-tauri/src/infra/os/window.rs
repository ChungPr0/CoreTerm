use std::sync::atomic::{AtomicBool, Ordering};

static HAS_NATIVE_WINDOW_BORDER: AtomicBool = AtomicBool::new(false);
static ALLOW_WINDOW_CLOSE: AtomicBool = AtomicBool::new(false);

pub fn has_native_window_border() -> bool {
    HAS_NATIVE_WINDOW_BORDER.load(Ordering::Relaxed)
}

pub fn allow_window_close() {
    ALLOW_WINDOW_CLOSE.store(true, Ordering::SeqCst);
}

pub fn is_window_close_allowed() -> bool {
    ALLOW_WINDOW_CLOSE.load(Ordering::SeqCst)
}

pub fn configure_main_window(window: &tauri::WebviewWindow) {
    let _ = window.set_background_color(Some(tauri::window::Color(9, 13, 22, 255)));

    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = window.hwnd() {
        use std::ffi::c_void;
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
        };
        use windows_sys::Win32::Graphics::Gdi::CreateSolidBrush;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetClassLongPtrW, GCLP_HBRBACKGROUND,
        };

        let raw_hwnd = hwnd.0 as HWND;
        // COLORREF uses 0x00BBGGRR: #090d16 -> 0x00160D09, #1e293b -> 0x003B291E.
        const APP_BG_COLORREF: u32 = 0x0016_0D09;
        const BORDER_COLORREF: u32 = 0x003B_291E;

        unsafe {
            let bg_brush = CreateSolidBrush(APP_BG_COLORREF);
            if !bg_brush.is_null() {
                SetClassLongPtrW(raw_hwnd, GCLP_HBRBACKGROUND, bg_brush as isize);
            }

            let dark_mode: i32 = 1;
            let _ = DwmSetWindowAttribute(
                raw_hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
                (&dark_mode as *const i32).cast::<c_void>(),
                std::mem::size_of::<i32>() as u32,
            );

            let hr = DwmSetWindowAttribute(
                raw_hwnd,
                DWMWA_BORDER_COLOR as u32,
                (&BORDER_COLORREF as *const u32).cast::<c_void>(),
                std::mem::size_of::<u32>() as u32,
            );
            HAS_NATIVE_WINDOW_BORDER.store(hr == 0, Ordering::Relaxed);
        }
    }
}

pub fn dispatch_window_sys_command(window: &tauri::WebviewWindow, action: &str) -> Result<(), String> {
    let is_maximized = window.is_maximized().unwrap_or(false);
    match action {
        "restore" => {
            if is_maximized {
                window.unmaximize().map_err(|e| e.to_string())?;
            }
        }
        "minimize" => {
            window.minimize().map_err(|e| e.to_string())?;
        }
        "maximize" => {
            if !is_maximized {
                window.maximize().map_err(|e| e.to_string())?;
            }
        }
        "close" => {
            allow_window_close();
            window.close().map_err(|e| e.to_string())?;
        }
        "move" | "size" => {
            // Handled interactively by frontend window manager.
            if is_maximized {
                return Ok(());
            }
        }
        other => return Err(format!("Unsupported window command: {other}")),
    }
    Ok(())
}

pub fn apply_ime_mode(window: &tauri::WebviewWindow, mode: &str) {
    if mode != "alphanumeric" {
        return;
    }

    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = window.hwnd() {
        use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
        use windows_sys::Win32::UI::Input::Ime::{
            ImmGetContext, ImmReleaseContext, ImmSetOpenStatus,
        };
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            LoadKeyboardLayoutW, KLF_ACTIVATE, KLF_SUBSTITUTE_OK,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            EnumChildWindows, PostMessageW, WM_INPUTLANGCHANGEREQUEST,
        };

        unsafe extern "system" fn apply_to_child(child: HWND, lparam: LPARAM) -> BOOL {
            let himc = ImmGetContext(child);
            if !himc.is_null() {
                let _ = ImmSetOpenStatus(himc, 0);
                let _ = ImmReleaseContext(child, himc);
            }
            if lparam != 0 {
                let _ = PostMessageW(child, WM_INPUTLANGCHANGEREQUEST, 0, lparam);
            }
            1
        }

        let raw_hwnd = hwnd.0 as HWND;
        let klid: Vec<u16> = "00000409\0".encode_utf16().collect();
        unsafe {
            let hkl = LoadKeyboardLayoutW(klid.as_ptr(), KLF_ACTIVATE | KLF_SUBSTITUTE_OK);
            let himc = ImmGetContext(raw_hwnd);
            if !himc.is_null() {
                let _ = ImmSetOpenStatus(himc, 0);
                let _ = ImmReleaseContext(raw_hwnd, himc);
            }
            let lparam = hkl as isize;
            if lparam != 0 {
                let _ = PostMessageW(raw_hwnd, WM_INPUTLANGCHANGEREQUEST, 0, lparam);
            }
            let _ = EnumChildWindows(raw_hwnd, Some(apply_to_child), lparam);
        }
    }

    #[cfg(not(target_os = "windows"))]
    let _ = window;
}

pub fn validate_http_url(raw_url: &str) -> Result<&str, String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() || trimmed.len() > 2048 {
        return Err("Invalid URL length.".to_string());
    }
    if trimmed
        .bytes()
        .any(|b| b <= 0x20 || b == 0x7f || b == b'"' || b == b'\\')
    {
        return Err("URL contains invalid whitespace or control characters.".to_string());
    }
    let bytes = trimmed.as_bytes();
    let rest = if bytes.len() >= 8 && bytes[..8].eq_ignore_ascii_case(b"https://") {
        &trimmed[8..]
    } else if bytes.len() >= 7 && bytes[..7].eq_ignore_ascii_case(b"http://") {
        &trimmed[7..]
    } else {
        return Err("Only http:// and https:// URLs are allowed.".to_string());
    };
    if rest.is_empty() || rest.starts_with('/') {
        return Err("URL host cannot be empty.".to_string());
    }
    Ok(trimmed)
}

pub fn open_external_url(raw_url: &str) -> Result<(), String> {
    let clean = validate_http_url(raw_url)?;

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let op: Vec<u16> = "open\0".encode_utf16().collect();
        let mut wide_url: Vec<u16> = clean.encode_utf16().collect();
        wide_url.push(0);

        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                wide_url.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if (result as isize) <= 32 {
            return Err(format!("Failed to launch default browser (code {}).", result as isize));
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = clean;
        Err("External URL opening is only supported on Windows.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::validate_http_url;

    #[test]
    fn validates_strict_http_and_https_urls() {
        assert_eq!(
            validate_http_url("https://github.com/org/repo?tab=readme#top").unwrap(),
            "https://github.com/org/repo?tab=readme#top"
        );
        assert_eq!(
            validate_http_url("  HTTP://localhost:3000/api  ").unwrap(),
            "HTTP://localhost:3000/api"
        );
        assert!(validate_http_url("file:///C:/Windows/System32/cmd.exe").is_err());
        assert!(validate_http_url("javascript:alert(1)").is_err());
        assert!(validate_http_url("https:///missing-host").is_err());
        assert!(validate_http_url("https://example.com/bad path").is_err());
        assert!(validate_http_url("https://example.com/\0bad").is_err());
        assert!(validate_http_url("https://example.com/\"quote").is_err());
        assert!(validate_http_url(r"https://example.com\backslash").is_err());
        assert_eq!(validate_http_url("http://đ.vn").unwrap(), "http://đ.vn");
        assert!(validate_http_url("").is_err());
    }
}
