use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use crate::db::Database;
use crate::ipc::dto::{
    AppStatusDto, CreateHostRequestDto, DeleteResultDto, GenerateSshKeyRequestDto,
    HostFullConfigDto, HostProfileSummaryDto, ImportSshKeyRequestDto, PortForwardRuleDto,
    PortForwardToggleResultDto, PortProbeResultDto, SessionConnectAckDto, SshKeyDto,
    UpdateDefaultKeyResultDto, UpdateHostRequestDto, UpdateSshOptionsFieldsDto,
    UpsertPortForwardRequestDto,
};
use crate::ipc::error::{AppError, AppResult};
use crate::pty::PtySessionManager;

pub struct AppState {
    pub db: Database,
    pub pty_manager: PtySessionManager,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_list(
    state: State<'_, AppState>,
    group_filter: Option<String>,
    tag_filter: Option<String>,
    search_query: Option<String>,
) -> AppResult<Vec<HostProfileSummaryDto>> {
    state.db.host_list(group_filter, tag_filter, search_query)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_get_detail(
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<HostFullConfigDto> {
    state.db.host_get_detail(&host_id)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn host_create(
    state: State<'_, AppState>,
    alias: String,
    host: String,
    port: Option<u16>,
    username: String,
    group_name: Option<String>,
    tags: Option<Vec<String>>,
    auth_method: String,
    ssh_key_id: Option<String>,
    private_key_path: Option<String>,
    password_mode: Option<String>,
    password: Option<String>,
    options: Option<UpdateSshOptionsFieldsDto>,
) -> AppResult<HostFullConfigDto> {
    state.db.host_create(CreateHostRequestDto {
        alias,
        host,
        port: port.unwrap_or(22),
        username,
        group_name: group_name.unwrap_or_else(|| "Default".to_string()),
        tags: tags.unwrap_or_default(),
        auth_method,
        ssh_key_id,
        private_key_path,
        password_mode,
        password,
        options,
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn host_update(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Option<String>,
    host_id: Option<String>,
    alias: String,
    host: String,
    port: Option<u16>,
    username: String,
    group_name: Option<String>,
    tags: Option<Vec<String>>,
    auth_method: String,
    ssh_key_id: Option<String>,
    private_key_path: Option<String>,
    password_mode: Option<String>,
    password: Option<String>,
    options: Option<UpdateSshOptionsFieldsDto>,
) -> AppResult<HostFullConfigDto> {
    let target_id = id
        .or(host_id)
        .ok_or_else(|| AppError::Validation("Missing host id for update".to_string()))?;

    let updated = state.db.host_update(UpdateHostRequestDto {
        id: target_id.clone(),
        alias,
        host,
        port: port.unwrap_or(22),
        username,
        group_name: group_name.unwrap_or_else(|| "Default".to_string()),
        tags: tags.unwrap_or_default(),
        auth_method,
        ssh_key_id,
        private_key_path,
        password_mode,
        password,
        options,
    })?;

    state
        .pty_manager
        .sync_host_telemetry(&app, &state.db, &target_id);
    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_duplicate(
    state: State<'_, AppState>,
    host_id: String,
    new_alias: String,
    new_host: String,
) -> AppResult<HostFullConfigDto> {
    state.db.host_duplicate(&host_id, &new_alias, &new_host)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_delete(
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<DeleteResultDto> {
    state.db.host_delete(&host_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_list(state: State<'_, AppState>) -> AppResult<Vec<SshKeyDto>> {
    state.db.key_list()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_get_default(state: State<'_, AppState>) -> AppResult<Option<SshKeyDto>> {
    state.db.key_get_default()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_generate(
    state: State<'_, AppState>,
    name: String,
    key_type: String,
    comment: Option<String>,
    passphrase: Option<String>,
    set_default: Option<bool>,
) -> AppResult<SshKeyDto> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.key_generate(GenerateSshKeyRequestDto {
            name,
            key_type,
            comment,
            passphrase,
            set_default: set_default.unwrap_or(false),
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Key generation task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_import(
    state: State<'_, AppState>,
    name: String,
    source_path: String,
    copy_to_managed_dir: Option<bool>,
    passphrase: Option<String>,
    set_default: Option<bool>,
) -> AppResult<SshKeyDto> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        db.key_import(ImportSshKeyRequestDto {
            name,
            source_path,
            copy_to_managed_dir: copy_to_managed_dir.unwrap_or(false),
            passphrase,
            set_default: set_default.unwrap_or(false),
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Key import task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_set_default(
    state: State<'_, AppState>,
    key_id: Option<String>,
) -> AppResult<UpdateDefaultKeyResultDto> {
    state.db.key_set_default(key_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_delete(
    state: State<'_, AppState>,
    key_id: String,
    delete_file_from_disk: Option<bool>,
) -> AppResult<DeleteResultDto> {
    state
        .db
        .key_delete(&key_id, delete_file_from_disk.unwrap_or(false))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn telemetry_set_local_config(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
    interval_sec: u16,
) -> AppResult<()> {
    state
        .pty_manager
        .sync_local_telemetry(&app, &state.db, enabled, interval_sec);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_upsert(
    state: State<'_, AppState>,
    id: Option<String>,
    host_id: String,
    label: String,
    forward_type: String,
    bind_address: Option<String>,
    bind_port: u16,
    target_host: Option<String>,
    target_port: Option<u16>,
    is_enabled: Option<bool>,
) -> AppResult<PortForwardRuleDto> {
    state.db.port_forward_upsert(UpsertPortForwardRequestDto {
        id,
        host_id,
        label,
        forward_type,
        bind_address: bind_address.unwrap_or_else(|| "127.0.0.1".to_string()),
        bind_port,
        target_host,
        target_port,
        is_enabled: is_enabled.unwrap_or(true),
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_toggle(
    state: State<'_, AppState>,
    rule_id: String,
    is_enabled: bool,
) -> AppResult<PortForwardToggleResultDto> {
    state.db.port_forward_toggle(&rule_id, is_enabled)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_delete(
    state: State<'_, AppState>,
    rule_id: String,
) -> AppResult<DeleteResultDto> {
    state.db.port_forward_delete(&rule_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_probe(
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<Vec<PortProbeResultDto>> {
    state.pty_manager.probe_host_ports(&state.db, &host_id)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn session_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    host_id: String,
    cols: u16,
    rows: u16,
    conflict_strategy: Option<String>,
    as_admin: Option<bool>,
    on_output: Channel<Vec<u8>>,
) -> AppResult<SessionConnectAckDto> {
    let pty_manager = state.pty_manager.clone();
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        pty_manager.connect(
            &app,
            &db,
            tab_id,
            host_id,
            cols,
            rows,
            conflict_strategy,
            as_admin,
            on_output,
        )
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
    state
        .pty_manager
        .submit_secret(&state.db, &tab_id, secret, save_to_vault.unwrap_or(false))
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
        .submit_host_key(&app, &state.db, &tab_id, &act)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
pub async fn session_reconnect(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    host_id: Option<String>,
    cols: u16,
    rows: u16,
    as_admin: Option<bool>,
    on_output: Channel<Vec<u8>>,
) -> AppResult<SessionConnectAckDto> {
    let pty_manager = state.pty_manager.clone();
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || {
        pty_manager.reconnect(&app, &db, tab_id, host_id, cols, rows, as_admin, on_output)
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

#[tauri::command]
pub async fn app_get_status() -> AppResult<AppStatusDto> {
    Ok(AppStatusDto {
        is_elevated: crate::os::is_process_elevated(),
        has_native_border: crate::os::has_native_window_border(),
    })
}

#[tauri::command]
pub async fn clipboard_read_text() -> AppResult<String> {
    crate::os::clipboard::read_text().map_err(AppError::Internal)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn clipboard_write_text(text: String) -> AppResult<()> {
    crate::os::clipboard::write_text(&text).map_err(AppError::Internal)
}

fn apply_launch_size(window: &tauri::WebviewWindow, cols: u16, rows: u16) {
    let clamped_cols = cols.clamp(40, 300) as f64;
    let clamped_rows = rows.clamp(10, 120) as f64;
    let width = (clamped_cols * 8.45 + 20.0).round();
    let height = (clamped_rows * 17.0 + 48.0).round();
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
}

/// Resizes main window based on terminal launch columns and rows.
#[tauri::command(rename_all = "snake_case")]
pub async fn window_set_launch_size(
    window: tauri::WebviewWindow,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    apply_launch_size(&window, cols, rows);
    Ok(())
}

/// Applies optional launch size and presents the main window once the first frame is ready.
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

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_list(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    state.db.host_group_list()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_create(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<String> {
    state.db.host_group_create(&name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_delete(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<DeleteResultDto> {
    state.db.host_group_delete(&name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_move_group(
    state: State<'_, AppState>,
    host_id: String,
    group_name: String,
) -> AppResult<String> {
    state.db.host_move_group(&host_id, &group_name)
}
