use tauri::{AppHandle, State};

use crate::ipc::commands::AppState;
use crate::ipc::dto::{
    SftpConnectAckDto, SftpListDirResultDto, SftpTransferJobDto,
};
use crate::ipc::error::AppResult;

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    host_id: String,
) -> AppResult<SftpConnectAckDto> {
    state
        .sftp_manager
        .connect(&app, &state.hosts, &state.keys, &tab_id, &host_id)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_disconnect(
    app: AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> AppResult<()> {
    state.sftp_manager.disconnect(&app, &tab_id).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_submit_secret(
    state: State<'_, AppState>,
    tab_id: String,
    secret: String,
    save_to_vault: bool,
) -> AppResult<()> {
    state
        .sftp_manager
        .submit_secret(&tab_id, secret, save_to_vault)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_submit_host_key(
    state: State<'_, AppState>,
    tab_id: String,
    action: String,
) -> AppResult<()> {
    state.sftp_manager.submit_host_key(&tab_id, &action)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    tab_id: String,
    path: String,
) -> AppResult<SftpListDirResultDto> {
    let (resolved, entries) = state.sftp_manager.remote_list_dir(&tab_id, &path).await?;
    Ok(SftpListDirResultDto {
        path: resolved,
        entries,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_create_dir(
    state: State<'_, AppState>,
    tab_id: String,
    parent_dir: String,
    name: String,
) -> AppResult<String> {
    state
        .sftp_manager
        .remote_create_dir(&tab_id, &parent_dir, &name)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_rename(
    state: State<'_, AppState>,
    tab_id: String,
    old_path: String,
    new_name: String,
) -> AppResult<String> {
    state
        .sftp_manager
        .remote_rename(&tab_id, &old_path, &new_name)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_delete(
    state: State<'_, AppState>,
    tab_id: String,
    paths: Vec<String>,
) -> AppResult<()> {
    state.sftp_manager.remote_delete(&tab_id, paths).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_chmod(
    state: State<'_, AppState>,
    tab_id: String,
    path: String,
    mode: u32,
) -> AppResult<()> {
    state.sftp_manager.remote_chmod(&tab_id, &path, mode).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_upload(
    state: State<'_, AppState>,
    tab_id: String,
    local_paths: Vec<String>,
    remote_dir: String,
    conflict_policy: String,
) -> AppResult<Vec<SftpTransferJobDto>> {
    state
        .sftp_manager
        .enqueue_uploads(&tab_id, local_paths, remote_dir, conflict_policy)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_download(
    state: State<'_, AppState>,
    tab_id: String,
    remote_paths: Vec<String>,
    local_dir: String,
    conflict_policy: String,
) -> AppResult<Vec<SftpTransferJobDto>> {
    state
        .sftp_manager
        .enqueue_downloads(&tab_id, remote_paths, local_dir, conflict_policy)
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_pause_transfer(
    state: State<'_, AppState>,
    tab_id: String,
    job_id: String,
) -> AppResult<()> {
    state.sftp_manager.pause_transfer(&tab_id, &job_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_resume_transfer(
    state: State<'_, AppState>,
    tab_id: String,
    job_id: String,
) -> AppResult<()> {
    state.sftp_manager.resume_transfer(&tab_id, &job_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_cancel_transfer(
    state: State<'_, AppState>,
    tab_id: String,
    job_id: String,
) -> AppResult<()> {
    state.sftp_manager.cancel_transfer(&tab_id, &job_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_resolve_conflict(
    state: State<'_, AppState>,
    tab_id: String,
    conflict_id: String,
    action: String,
    apply_to_all: bool,
) -> AppResult<()> {
    state
        .sftp_manager
        .resolve_conflict(&tab_id, &conflict_id, &action, apply_to_all)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_list_transfers(
    state: State<'_, AppState>,
    tab_id: String,
) -> AppResult<Vec<SftpTransferJobDto>> {
    state.sftp_manager.list_transfers(&tab_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn sftp_clear_finished_transfers(
    state: State<'_, AppState>,
    tab_id: String,
) -> AppResult<()> {
    state.sftp_manager.clear_finished_transfers(&tab_id)
}
