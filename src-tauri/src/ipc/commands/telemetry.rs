use tauri::{AppHandle, State};

use crate::ipc::commands::AppState;
use crate::ipc::error::AppResult;

#[tauri::command(rename_all = "snake_case")]
pub async fn telemetry_set_local_config(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
    interval_sec: u16,
) -> AppResult<()> {
    state
        .pty_manager
        .sync_local_telemetry(&app, &state.hosts, enabled, interval_sec);
    Ok(())
}
