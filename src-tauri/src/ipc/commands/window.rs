use crate::core::defaults::{
    DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS, MAX_LAUNCH_COLS, MAX_LAUNCH_ROWS, MIN_LAUNCH_COLS,
    MIN_LAUNCH_ROWS,
};
use crate::infra::os;
use crate::ipc::commands::AppState;
use crate::ipc::dto::AppStatusDto;
use crate::ipc::error::{AppError, AppResult};
use tauri::{Manager, State};

#[tauri::command]
pub async fn app_get_status() -> AppResult<AppStatusDto> {
    Ok(AppStatusDto {
        is_elevated: os::is_process_elevated(),
        has_native_border: os::has_native_window_border(),
    })
}

#[tauri::command]
pub async fn clipboard_read_text() -> AppResult<String> {
    os::clipboard::read_text().map_err(AppError::Internal)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn clipboard_write_text(text: String) -> AppResult<()> {
    os::clipboard::write_text(&text).map_err(AppError::Internal)
}

#[tauri::command]
pub async fn context_menu_get_status() -> AppResult<bool> {
    Ok(os::context_menu::is_context_menu_registered())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn context_menu_set_enabled(app: tauri::AppHandle, enabled: bool) -> AppResult<bool> {
    if enabled {
        os::context_menu::register_context_menu().map_err(AppError::Internal)?;
    } else {
        os::context_menu::unregister_context_menu().map_err(AppError::Internal)?;
    }
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        os::context_menu::set_context_menu_opt_out(&app_data_dir, !enabled);
    }
    Ok(os::context_menu::is_context_menu_registered())
}

#[tauri::command]
pub async fn startup_get_status() -> AppResult<bool> {
    Ok(os::startup::is_startup_registered())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn startup_set_enabled(enabled: bool) -> AppResult<bool> {
    if enabled {
        os::startup::register_startup().map_err(AppError::Internal)?;
    } else {
        os::startup::unregister_startup().map_err(AppError::Internal)?;
    }
    Ok(os::startup::is_startup_registered())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn startup_sync_prefs(
    app: tauri::AppHandle,
    new_instance_behavior: String,
) -> AppResult<()> {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        os::startup_prefs::write_startup_prefs(&app_data_dir, &new_instance_behavior)
            .map_err(AppError::Internal)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn app_get_launch_dir(state: State<'_, AppState>) -> AppResult<Option<String>> {
    Ok(state.launch_dir.clone())
}

#[tauri::command]
pub async fn app_get_launch_files(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    Ok(state.launch_files.clone())
}

fn calc_launch_dims(cols: u16, rows: u16, width: Option<f64>, height: Option<f64>) -> (f64, f64) {
    let clamped_cols = cols.clamp(MIN_LAUNCH_COLS, MAX_LAUNCH_COLS) as f64;
    let clamped_rows = rows.clamp(MIN_LAUNCH_ROWS, MAX_LAUNCH_ROWS) as f64;
    let target_w = width
        .filter(|w| w.is_finite() && *w > 0.0)
        .unwrap_or_else(|| (clamped_cols * 9.4 + 19.0).round())
        .clamp(640.0, 4096.0);
    let target_h = height
        .filter(|h| h.is_finite() && *h > 0.0)
        .unwrap_or_else(|| (clamped_rows * 19.2 + 50.0).round())
        .clamp(380.0, 4096.0);
    (target_w, target_h)
}

fn apply_launch_size(
    window: &tauri::WebviewWindow,
    cols: u16,
    rows: u16,
    width: Option<f64>,
    height: Option<f64>,
) {
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    let (mut target_w, mut target_h) = calc_launch_dims(cols, rows, width, height);
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale = monitor.scale_factor();
        let size = monitor.size();
        let mon_w = (size.width as f64) / scale;
        let mon_h = (size.height as f64) / scale;
        if mon_w > 100.0 && mon_h > 100.0 {
            // Keep window within the usable monitor boundaries
            target_w = target_w.min((mon_w - 40.0).max(640.0));
            target_h = target_h.min((mon_h - 60.0).max(380.0));
        }
    }
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
        target_w, target_h,
    )));
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_set_launch_size(
    window: tauri::WebviewWindow,
    cols: u16,
    rows: u16,
    width: Option<f64>,
    height: Option<f64>,
) -> AppResult<()> {
    apply_launch_size(&window, cols, rows, width, height);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_present(
    window: tauri::WebviewWindow,
    cols: Option<u16>,
    rows: Option<u16>,
    width: Option<f64>,
    height: Option<f64>,
    launch_mode: Option<String>,
    center_on_launch: Option<bool>,
    always_on_top: Option<bool>,
) -> AppResult<()> {
    if cols.is_some() || rows.is_some() || width.is_some() || height.is_some() {
        apply_launch_size(
            &window,
            cols.unwrap_or(DEFAULT_TERM_COLS),
            rows.unwrap_or(DEFAULT_TERM_ROWS),
            width,
            height,
        );
    }
    if center_on_launch.unwrap_or(false) && !window.is_maximized().unwrap_or(false) {
        let _ = window.center();
    }
    if let Some(on_top) = always_on_top {
        let _ = window.set_always_on_top(on_top);
    }

    match launch_mode.as_deref() {
        Some("maximized") => {
            if !window.is_visible().unwrap_or(false) {
                let _ = window.show();
            }
            let _ = window.maximize();
            let _ = window.set_focus();
        }
        Some("fullscreen") => {
            if !window.is_visible().unwrap_or(false) {
                let _ = window.show();
            }
            let _ = window.set_fullscreen(true);
            let _ = window.set_focus();
        }
        _ => {
            if !window.is_visible().unwrap_or(false) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn window_minimize(window: tauri::WebviewWindow) -> AppResult<()> {
    let _ = window.minimize();
    Ok(())
}

#[tauri::command]
pub async fn window_toggle_maximize(window: tauri::WebviewWindow) -> AppResult<()> {
    if window.is_fullscreen().unwrap_or(false) {
        let _ = window.set_fullscreen(false);
        return Ok(());
    }
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_set_always_on_top(
    window: tauri::WebviewWindow,
    enabled: bool,
) -> AppResult<()> {
    let _ = window.set_always_on_top(enabled);
    Ok(())
}

#[tauri::command]
pub async fn window_toggle_fullscreen(window: tauri::WebviewWindow) -> AppResult<bool> {
    let next = !window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(next);
    Ok(next)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_apply_ime_mode(
    window: tauri::WebviewWindow,
    mode: String,
) -> AppResult<()> {
    os::window::apply_ime_mode(&window, &mode);
    Ok(())
}

#[tauri::command]
pub async fn window_close(window: tauri::WebviewWindow) -> AppResult<()> {
    let _ = window.close();
    Ok(())
}

#[tauri::command]
pub async fn window_is_maximized(window: tauri::WebviewWindow) -> AppResult<bool> {
    Ok(window.is_maximized().unwrap_or(false))
}

#[tauri::command]
pub async fn window_get_position(window: tauri::WebviewWindow) -> AppResult<(f64, f64)> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let phys = window.outer_position().unwrap_or_default();
    let logical = phys.to_logical::<f64>(scale);
    Ok((logical.x, logical.y))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_set_position(window: tauri::WebviewWindow, x: f64, y: f64) -> AppResult<()> {
    let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
    Ok(())
}

#[tauri::command]
pub async fn window_get_size(window: tauri::WebviewWindow) -> AppResult<(f64, f64)> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let phys = window.outer_size().unwrap_or_default();
    let logical = phys.to_logical::<f64>(scale);
    Ok((logical.width, logical.height))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_set_size(window: tauri::WebviewWindow, width: f64, height: f64) -> AppResult<()> {
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
    Ok(())
}

#[tauri::command]
pub async fn window_sys_command(
    window: tauri::WebviewWindow,
    action: String,
) -> AppResult<()> {
    os::window::dispatch_window_sys_command(&window, &action).map_err(AppError::Os)
}

#[cfg(test)]
mod tests {
    use super::calc_launch_dims;
    use crate::core::defaults::{DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS};

    #[test]
    fn calc_launch_dims_uses_measured_or_clamped_fallback() {
        assert_eq!(calc_launch_dims(DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS, None, None), (1147.0, 626.0));
        assert_eq!(
            calc_launch_dims(DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS, Some(1075.0), Some(626.0)),
            (1075.0, 626.0)
        );
        assert_eq!(
            calc_launch_dims(DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS, Some(-10.0), Some(f64::NAN)),
            (1147.0, 626.0)
        );
        assert_eq!(
            calc_launch_dims(20, 5, Some(200.0), Some(100.0)),
            (640.0, 380.0)
        );
        assert_eq!(
            calc_launch_dims(999, 999, None, None),
            (1899.0, 1010.0)
        );
    }
}
