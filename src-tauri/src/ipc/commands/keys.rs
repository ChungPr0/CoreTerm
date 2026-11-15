use tauri::State;

use crate::ipc::commands::AppState;
use crate::ipc::dto::{
    DeleteResultDto, GenerateSshKeyRequestDto, ImportSshKeyRequestDto, SshKeyDto,
    UpdateDefaultKeyResultDto,
};
use crate::ipc::error::{AppError, AppResult};

#[tauri::command(rename_all = "snake_case")]
pub async fn key_list(state: State<'_, AppState>) -> AppResult<Vec<SshKeyDto>> {
    state.keys.list()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_get_default(state: State<'_, AppState>) -> AppResult<Option<SshKeyDto>> {
    state.keys.get_default()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_generate(
    state: State<'_, AppState>,
    req: GenerateSshKeyRequestDto,
) -> AppResult<SshKeyDto> {
    let keys = state.keys.clone();
    tokio::task::spawn_blocking(move || keys.generate(req))
        .await
        .map_err(|e| AppError::Internal(format!("Key generation task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_import(
    state: State<'_, AppState>,
    req: ImportSshKeyRequestDto,
) -> AppResult<SshKeyDto> {
    let keys = state.keys.clone();
    tokio::task::spawn_blocking(move || keys.import(req))
        .await
        .map_err(|e| AppError::Internal(format!("Key import task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_set_default(
    state: State<'_, AppState>,
    key_id: Option<String>,
) -> AppResult<UpdateDefaultKeyResultDto> {
    state.keys.set_default(key_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn key_delete(
    state: State<'_, AppState>,
    key_id: String,
    delete_file_from_disk: Option<bool>,
) -> AppResult<DeleteResultDto> {
    state
        .keys
        .delete(&key_id, delete_file_from_disk.unwrap_or(false))
}
