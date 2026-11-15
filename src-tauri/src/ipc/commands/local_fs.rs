use crate::infra::local_fs;
use crate::ipc::dto::{LocalDriveDto, LocalListDirResultDto};
use crate::ipc::error::{AppError, AppResult};

async fn spawn_fs<F, T>(f: F) -> AppResult<T>
where
    F: FnOnce() -> AppResult<T> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_list_drives() -> AppResult<Vec<LocalDriveDto>> {
    spawn_fs(local_fs::list_drives).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_home_dir() -> AppResult<String> {
    spawn_fs(|| Ok(local_fs::default_home_dir())).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_list_dir(path: String) -> AppResult<LocalListDirResultDto> {
    spawn_fs(move || {
        let (resolved, entries) = local_fs::list_dir(&path)?;
        Ok(LocalListDirResultDto {
            path: resolved,
            entries,
        })
    })
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_create_dir(parent_dir: String, name: String) -> AppResult<String> {
    spawn_fs(move || local_fs::create_dir(&parent_dir, &name)).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_rename(old_path: String, new_name: String) -> AppResult<String> {
    spawn_fs(move || local_fs::rename_entry(&old_path, &new_name)).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_delete(paths: Vec<String>) -> AppResult<()> {
    spawn_fs(move || local_fs::delete_entries(&paths)).await
}
