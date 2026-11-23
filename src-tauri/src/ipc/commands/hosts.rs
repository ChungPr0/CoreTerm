use tauri::State;

use crate::ipc::commands::AppState;
use crate::ipc::dto::{
    CreateHostRequestDto, DeleteResultDto, HostFullConfigDto, HostProfileSummaryDto,
    PortForwardRuleDto, PortForwardToggleResultDto, PortProbeResultDto, UpdateHostRequestDto,
    UpsertPortForwardRequestDto,
};
use crate::ipc::error::AppResult;

#[tauri::command(rename_all = "snake_case")]
pub async fn host_list(
    state: State<'_, AppState>,
    group_filter: Option<String>,
    tag_filter: Option<String>,
    search_query: Option<String>,
) -> AppResult<Vec<HostProfileSummaryDto>> {
    state.hosts.list(group_filter, tag_filter, search_query)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_get_detail(
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<HostFullConfigDto> {
    state.hosts.get_detail(&host_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_create(
    state: State<'_, AppState>,
    req: CreateHostRequestDto,
) -> AppResult<HostFullConfigDto> {
    state.hosts.create(req)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_update(
    state: State<'_, AppState>,
    req: UpdateHostRequestDto,
) -> AppResult<HostFullConfigDto> {
    let updated = state.hosts.update(req)?;
    state.tab_secrets.clear_host(&updated.id);
    Ok(updated)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_duplicate(
    state: State<'_, AppState>,
    host_id: String,
    new_alias: String,
    new_host: String,
) -> AppResult<HostFullConfigDto> {
    state.hosts.duplicate(&host_id, &new_alias, &new_host)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_delete(
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<DeleteResultDto> {
    let res = state.hosts.delete(&host_id)?;
    state.tab_secrets.clear_host(&host_id);
    Ok(res)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_list(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    state.hosts.list_groups()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_create(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<String> {
    state.hosts.create_group(&name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_delete(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<DeleteResultDto> {
    state.hosts.delete_group(&name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_group_reorder(
    state: State<'_, AppState>,
    group_names: Vec<String>,
) -> AppResult<Vec<String>> {
    state.hosts.reorder_groups(group_names)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn host_move_group(
    state: State<'_, AppState>,
    host_id: String,
    group_name: String,
) -> AppResult<String> {
    state.hosts.move_group(&host_id, &group_name)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_upsert(
    state: State<'_, AppState>,
    req: UpsertPortForwardRequestDto,
) -> AppResult<PortForwardRuleDto> {
    state.hosts.upsert_port_forward(req)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_toggle(
    state: State<'_, AppState>,
    rule_id: String,
    is_enabled: bool,
) -> AppResult<PortForwardToggleResultDto> {
    state.hosts.toggle_port_forward(&rule_id, is_enabled)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_delete(
    state: State<'_, AppState>,
    rule_id: String,
) -> AppResult<DeleteResultDto> {
    state.hosts.delete_port_forward(&rule_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_forward_probe(
    state: State<'_, AppState>,
    host_id: String,
) -> AppResult<Vec<PortProbeResultDto>> {
    state.pty_manager.probe_host_ports(&state.hosts, &host_id)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn port_check_available(
    state: State<'_, AppState>,
    bind_address: String,
    bind_port: u16,
) -> AppResult<PortProbeResultDto> {
    Ok(state.pty_manager.check_port_available(&bind_address, bind_port))
}
