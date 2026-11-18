use crate::core::defaults::{
    DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS, MAX_LAUNCH_COLS, MAX_LAUNCH_ROWS, MIN_LAUNCH_COLS,
    MIN_LAUNCH_ROWS,
};
use crate::infra::os;
use crate::ipc::commands::AppState;
use crate::ipc::dto::AppStatusDto;
use crate::ipc::error::{AppError, AppResult};
use tauri::State;

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
pub async fn context_menu_set_enabled(enabled: bool) -> AppResult<bool> {
    if enabled {
        os::context_menu::register_context_menu().map_err(AppError::Internal)?;
    } else {
        os::context_menu::unregister_context_menu().map_err(AppError::Internal)?;
    }
    Ok(os::context_menu::is_context_menu_registered())
}

#[tauri::command]
pub async fn app_get_launch_dir(state: State<'_, AppState>) -> AppResult<Option<String>> {
    Ok(state.launch_dir.clone())
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
    let (target_w, target_h) = calc_launch_dims(cols, rows, width, height);
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
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
        let _ = window.set_focus();
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
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
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
    }
}
