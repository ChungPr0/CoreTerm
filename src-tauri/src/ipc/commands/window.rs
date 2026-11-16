use crate::infra::os;
use crate::ipc::dto::AppStatusDto;
use crate::ipc::error::{AppError, AppResult};

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

fn apply_launch_size(window: &tauri::WebviewWindow, cols: u16, rows: u16) {
    let clamped_cols = cols.clamp(40, 300) as f64;
    let clamped_rows = rows.clamp(10, 120) as f64;
    let width = (clamped_cols * 8.45 + 20.0).round();
    let height = (clamped_rows * 17.0 + 48.0).round();
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_set_launch_size(
    window: tauri::WebviewWindow,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    apply_launch_size(&window, cols, rows);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_present(
    window: tauri::WebviewWindow,
    cols: Option<u16>,
    rows: Option<u16>,
) -> AppResult<()> {
    if let (Some(c), Some(r)) = (cols, rows) {
        apply_launch_size(&window, c, r);
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
