use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static HAS_NATIVE_WINDOW_BORDER: AtomicBool = AtomicBool::new(false);
static ALLOW_WINDOW_CLOSE: AtomicBool = AtomicBool::new(false);

struct PreFullscreenState {
    was_maximized: bool,
    #[cfg(target_os = "windows")]
    placement: Option<windows_sys::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT>,
    fallback_pos: Option<tauri::PhysicalPosition<i32>>,
    fallback_size: Option<tauri::PhysicalSize<u32>>,
}

static PRE_FULLSCREEN_STATE: Mutex<Option<PreFullscreenState>> = Mutex::new(None);

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

#[cfg(target_os = "windows")]
fn set_dwm_transitions_disabled(window: &tauri::WebviewWindow, disabled: bool) {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let val: i32 = i32::from(disabled);
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd.0 as HWND,
            DWMWA_TRANSITIONS_FORCEDISABLED as u32,
            (&val as *const i32).cast::<c_void>(),
            std::mem::size_of::<i32>() as u32,
        );
    }
}

#[cfg(target_os = "windows")]
fn capture_win32_placement(
    window: &tauri::WebviewWindow,
) -> Option<windows_sys::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowPlacement, WINDOWPLACEMENT};

    let hwnd = window.hwnd().ok()?;
    let raw_hwnd = hwnd.0 as HWND;
    let mut wp: WINDOWPLACEMENT = unsafe { std::mem::zeroed() };
    wp.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
    let ok = unsafe { GetWindowPlacement(raw_hwnd, &mut wp) };
    if ok != 0 {
        Some(wp)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn enforce_win32_fullscreen_bounds(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, HWND_TOP, SWP_FRAMECHANGED,
        SWP_NOOWNERZORDER, SWP_SHOWWINDOW, WS_MAXIMIZE, WS_OVERLAPPEDWINDOW,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let raw_hwnd = hwnd.0 as HWND;
    unsafe {
        // Strip WS_MAXIMIZE and WS_OVERLAPPEDWINDOW in-place without calling SW_RESTORE
        // so Maximized -> Fullscreen expands directly without shrinking first.
        let cur_style = GetWindowLongPtrW(raw_hwnd, GWL_STYLE) as u32;
        let clean_style = cur_style & !(WS_MAXIMIZE | WS_OVERLAPPEDWINDOW);
        if clean_style != cur_style {
            SetWindowLongPtrW(raw_hwnd, GWL_STYLE, clean_style as isize);
        }

        let hmon = MonitorFromWindow(raw_hwnd, MONITOR_DEFAULTTONEAREST);
        if hmon.is_null() {
            return;
        }
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(hmon, &mut mi) != 0 {
            let r = mi.rcMonitor;
            let _ = SetWindowPos(
                raw_hwnd,
                HWND_TOP,
                r.left,
                r.top,
                r.right - r.left,
                r.bottom - r.top,
                SWP_FRAMECHANGED | SWP_NOOWNERZORDER | SWP_SHOWWINDOW,
            );
        }
    }
}

#[cfg(target_os = "windows")]
fn restore_win32_placement(
    window: &tauri::WebviewWindow,
    wp: &windows_sys::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT,
    as_maximized: bool,
) -> bool {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPlacement, SetWindowPos, HWND_TOP, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_NOZORDER, SW_SHOWMAXIMIZED, SW_SHOWNORMAL, WINDOWPLACEMENT,
    };

    let Ok(hwnd) = window.hwnd() else {
        return false;
    };
    let raw_hwnd = hwnd.0 as HWND;
    let mut restored = *wp;
    restored.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
    restored.showCmd = if as_maximized {
        SW_SHOWMAXIMIZED as u32
    } else {
        SW_SHOWNORMAL as u32
    };
    unsafe {
        let ok = SetWindowPlacement(raw_hwnd, &restored) != 0;
        let _ = SetWindowPos(
            raw_hwnd,
            HWND_TOP,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
        ok
    }
}

fn apply_fullscreen_on_current_thread(
    window: &tauri::WebviewWindow,
    fullscreen: bool,
    force_exit_maximized: bool,
) -> (bool, bool) {
    let currently_fs = window.is_fullscreen().unwrap_or(false);
    if currently_fs == fullscreen {
        let is_max = !currently_fs && window.is_maximized().unwrap_or(false);
        return (currently_fs, is_max);
    }

    #[cfg(target_os = "windows")]
    set_dwm_transitions_disabled(window, true);

    let result = if fullscreen {
        let was_maximized = window.is_maximized().unwrap_or(false);
        let state = PreFullscreenState {
            was_maximized,
            #[cfg(target_os = "windows")]
            placement: capture_win32_placement(window),
            fallback_pos: window.outer_position().ok(),
            fallback_size: window.outer_size().ok(),
        };
        if let Ok(mut guard) = PRE_FULLSCREEN_STATE.lock() {
            *guard = Some(state);
        }

        let _ = window.set_fullscreen(true);
        #[cfg(target_os = "windows")]
        enforce_win32_fullscreen_bounds(window);
        let _ = window.set_focus();
        (window.is_fullscreen().unwrap_or(true), false)
    } else {
        let saved = PRE_FULLSCREEN_STATE
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
        let target_maximized =
            force_exit_maximized || saved.as_ref().is_some_and(|s| s.was_maximized);

        let _ = window.set_fullscreen(false);

        if let Some(saved) = saved {
            let mut placement_restored = false;
            #[cfg(target_os = "windows")]
            if let Some(ref wp) = saved.placement {
                placement_restored = restore_win32_placement(window, wp, target_maximized);
            }
            if !placement_restored && !target_maximized {
                if let Some(size) = saved.fallback_size {
                    let _ = window.set_size(tauri::Size::Physical(size));
                }
                if let Some(pos) = saved.fallback_pos {
                    let _ = window.set_position(tauri::Position::Physical(pos));
                }
            }
        }

        if target_maximized && !window.is_maximized().unwrap_or(false) {
            let _ = window.maximize();
        }

        let _ = window.set_focus();
        let is_fs = window.is_fullscreen().unwrap_or(false);
        (is_fs, !is_fs && window.is_maximized().unwrap_or(false))
    };

    #[cfg(target_os = "windows")]
    set_dwm_transitions_disabled(window, false);

    result
}

pub async fn set_window_fullscreen(
    window: &tauri::WebviewWindow,
    fullscreen: bool,
) -> Result<(bool, bool), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let win_clone = window.clone();
    window
        .run_on_main_thread(move || {
            let state = apply_fullscreen_on_current_thread(&win_clone, fullscreen, false);
            let _ = tx.send(state);
        })
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())
}

pub async fn toggle_window_fullscreen(
    window: &tauri::WebviewWindow,
) -> Result<(bool, bool), String> {
    let next = !window.is_fullscreen().unwrap_or(false);
    set_window_fullscreen(window, next).await
}

pub async fn toggle_window_maximize(
    window: &tauri::WebviewWindow,
) -> Result<(bool, bool), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let win_clone = window.clone();
    window
        .run_on_main_thread(move || {
            if win_clone.is_fullscreen().unwrap_or(false) {
                let state = apply_fullscreen_on_current_thread(&win_clone, false, false);
                let _ = tx.send(state);
                return;
            }
            if win_clone.is_maximized().unwrap_or(false) {
                let _ = win_clone.unmaximize();
            } else {
                let _ = win_clone.maximize();
            }
            let is_fs = win_clone.is_fullscreen().unwrap_or(false);
            let _ = tx.send((is_fs, !is_fs && win_clone.is_maximized().unwrap_or(false)));
        })
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())
}

pub async fn dispatch_window_sys_command(
    window: &tauri::WebviewWindow,
    action: &str,
) -> Result<(), String> {
    match action {
        "restore" => {
            let (tx, rx) = tokio::sync::oneshot::channel();
            let win_clone = window.clone();
            window
                .run_on_main_thread(move || {
                    if win_clone.is_fullscreen().unwrap_or(false) {
                        let _ = apply_fullscreen_on_current_thread(&win_clone, false, false);
                    } else if win_clone.is_maximized().unwrap_or(false) {
                        let _ = win_clone.unmaximize();
                    }
                    let _ = tx.send(());
                })
                .map_err(|e| e.to_string())?;
            let _ = rx.await;
        }
        "minimize" => {
            window.minimize().map_err(|e| e.to_string())?;
        }
        "maximize" => {
            let (tx, rx) = tokio::sync::oneshot::channel();
            let win_clone = window.clone();
            window
                .run_on_main_thread(move || {
                    if win_clone.is_fullscreen().unwrap_or(false) {
                        let _ = apply_fullscreen_on_current_thread(&win_clone, false, true);
                    } else if !win_clone.is_maximized().unwrap_or(false) {
                        let _ = win_clone.maximize();
                    }
                    let _ = tx.send(());
                })
                .map_err(|e| e.to_string())?;
            let _ = rx.await;
        }
        "close" => {
            allow_window_close();
            window.close().map_err(|e| e.to_string())?;
        }
        "move" | "size" => {
            // Handled interactively by frontend window manager.
            if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
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
        use windows_sys::Win32::UI::WindowsAndMessaging::EnumChildWindows;

        unsafe extern "system" fn close_ime_on_child(child: HWND, _lparam: LPARAM) -> BOOL {
            let himc = ImmGetContext(child);
            if !himc.is_null() {
                let _ = ImmSetOpenStatus(himc, 0);
                let _ = ImmReleaseContext(child, himc);
            }
            1
        }

        let raw_hwnd = hwnd.0 as HWND;
        unsafe {
            let himc = ImmGetContext(raw_hwnd);
            if !himc.is_null() {
                let _ = ImmSetOpenStatus(himc, 0);
                let _ = ImmReleaseContext(raw_hwnd, himc);
            }
            let _ = EnumChildWindows(raw_hwnd, Some(close_ime_on_child), 0);
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
