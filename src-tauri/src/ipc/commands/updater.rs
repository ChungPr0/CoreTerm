use tauri::{Emitter, State};

use crate::infra::os;
use crate::ipc::commands::AppState;
use crate::ipc::dto::{AppUpdateEnvDto, UpdateCheckResultDto, UpdateDownloadResultDto};
use crate::ipc::error::AppResult;
use crate::ipc::events::EVENT_UPDATER_PROGRESS;

#[tauri::command]
pub async fn updater_get_info(state: State<'_, AppState>) -> AppResult<AppUpdateEnvDto> {
    Ok(state.updater.get_env_info())
}

#[tauri::command]
pub async fn updater_check(state: State<'_, AppState>) -> AppResult<UpdateCheckResultDto> {
    state.updater.check_for_update().await
}

#[tauri::command]
pub async fn updater_download(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<UpdateDownloadResultDto> {
    let result = state
        .updater
        .download_update(|progress| {
            let _ = app.emit(EVENT_UPDATER_PROGRESS, progress);
        })
        .await?;
    Ok(result)
}

#[tauri::command]
pub async fn updater_install(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.updater.launch_staged_installer()?;
    os::allow_window_close();
    let _ = window.close();
    Ok(())
}
