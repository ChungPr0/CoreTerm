use std::sync::atomic::{AtomicBool, Ordering};

static HAS_NATIVE_WINDOW_BORDER: AtomicBool = AtomicBool::new(false);

pub fn has_native_window_border() -> bool {
    HAS_NATIVE_WINDOW_BORDER.load(Ordering::Relaxed)
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
