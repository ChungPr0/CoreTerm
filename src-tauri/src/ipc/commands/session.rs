use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::ipc::commands::AppState;
use crate::ipc::dto::{
    SessionConnectAckDto, SessionConnectRequestDto, SessionReconnectRequestDto,
};
use crate::ipc::error::{AppError, AppResult};

#[tauri::command(rename_all = "snake_case")]
pub async fn session_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    req: SessionConnectRequestDto,
    on_output: Channel<Vec<u8>>,
) -> AppResult<SessionConnectAckDto> {
    let pty_manager = state.pty_manager.clone();
    let hosts = state.hosts.clone();
    let keys = state.keys.clone();
    tokio::task::spawn_blocking(move || {
        pty_manager.connect(&app, &hosts, &keys, req, on_output)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Session task panicked: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn session_write_stdin(
    state: State<'_, AppState>,
    tab_id: String,
    data: Vec<u8>,
) -> AppResult<()> {
    state.pty_manager.write_stdin(&tab_id, &data)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn session_resize_pty(
    state: State<'_, AppState>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    state.pty_manager.resize_pty(&tab_id, cols, rows)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn session_submit_secret(
    state: State<'_, AppState>,
    tab_id: String,
    secret: String,
    save_to_vault: Option<bool>,
) -> AppResult<()> {
    state.pty_manager.submit_secret(
        &state.hosts,
        &state.keys,
        &tab_id,
        secret,
        save_to_vault.unwrap_or(false),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub async fn session_submit_host_key(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    action: Option<String>,
    decision: Option<String>,
) -> AppResult<()> {
    let act = action.or(decision).unwrap_or_else(|| "ACCEPT".to_string());
    state
        .pty_manager
        .submit_host_key(&app, &state.hosts, &tab_id, &act)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn session_reconnect(
    app: AppHandle,
    state: State<'_, AppState>,
    req: SessionReconnectRequestDto,
    on_output: Channel<Vec<u8>>,
) -> AppResult<SessionConnectAckDto> {
    let pty_manager = state.pty_manager.clone();
    let hosts = state.hosts.clone();
    let keys = state.keys.clone();
    tokio::task::spawn_blocking(move || {
        pty_manager.reconnect(&app, &hosts, &keys, req, on_output)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Reconnect task panicked: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn session_disconnect(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> AppResult<()> {
    state.pty_manager.disconnect(&app, &tab_id)
}
