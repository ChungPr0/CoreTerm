use serde::{Deserialize, Serialize};

fn default_ssh_port() -> u16 {
    22
}

fn default_group_name() -> String {
    "Default".to_string()
}

fn default_bind_address() -> String {
    "127.0.0.1".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostProfileSummaryDto {
    pub id: String,
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub group_name: String,
    pub tags: Vec<String>,
    pub auth_method: String,
    pub ssh_key_id: Option<String>,
    pub ssh_key_name: Option<String>,
    pub private_key_path: Option<String>,
    pub password_mode: String,
    pub has_saved_password: bool,
    pub active_port_forwards_count: usize,
    pub auto_reconnect: bool,
    pub reconnect_interval_sec: u16,
    pub last_connected_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostFullConfigDto {
    pub id: String,
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub group_name: String,
    pub tags: Vec<String>,
    pub auth_method: String,
    pub ssh_key_id: Option<String>,
    pub private_key_path: Option<String>,
    pub password_mode: String,
    pub has_saved_password: bool,
    pub last_connected_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub options: SshOptionsDto,
    pub port_forwards: Vec<PortForwardRuleDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateSshOptionsFieldsDto {
    pub server_alive_interval: Option<u16>,
    pub server_alive_count_max: Option<u8>,
    pub compression: Option<bool>,
    pub strict_host_key_checking: Option<String>,
    pub startup_command: Option<String>,
    pub forward_agent: Option<bool>,
    pub auto_reconnect: Option<bool>,
    pub reconnect_interval_sec: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHostRequestDto {
    pub alias: String,
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    pub username: String,
    #[serde(default = "default_group_name")]
    pub group_name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub auth_method: String,
    pub ssh_key_id: Option<String>,
    pub private_key_path: Option<String>,
    pub password_mode: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub options: Option<UpdateSshOptionsFieldsDto>,
    #[serde(default)]
    pub port_forwards: Option<Vec<SavePortForwardDto>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateHostRequestDto {
    #[serde(alias = "host_id")]
    pub id: String,
    pub alias: String,
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    pub username: String,
    #[serde(default = "default_group_name")]
    pub group_name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub auth_method: String,
    pub ssh_key_id: Option<String>,
    pub private_key_path: Option<String>,
    pub password_mode: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub options: Option<UpdateSshOptionsFieldsDto>,
    #[serde(default)]
    pub port_forwards: Option<Vec<SavePortForwardDto>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavePortForwardDto {
    pub id: Option<String>,
    pub label: String,
    pub forward_type: String,
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
    pub bind_port: u16,
    pub target_host: Option<String>,
    pub target_port: Option<u16>,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshOptionsDto {
    pub host_id: String,
    pub server_alive_interval: u16,
    pub server_alive_count_max: u8,
    pub compression: bool,
    pub strict_host_key_checking: String,
    pub startup_command: Option<String>,
    pub forward_agent: bool,
    pub auto_reconnect: bool,
    pub reconnect_interval_sec: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardRuleDto {
    pub id: String,
    pub host_id: String,
    pub label: String,
    pub forward_type: String,
    pub bind_address: String,
    pub bind_port: u16,
    pub target_host: Option<String>,
    pub target_port: Option<u16>,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertPortForwardRequestDto {
    pub id: Option<String>,
    pub host_id: String,
    pub label: String,
    pub forward_type: String,
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
    pub bind_port: u16,
    pub target_host: Option<String>,
    pub target_port: Option<u16>,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortProbeResultDto {
    pub rule_id: String,
    pub bind_address: String,
    pub bind_port: u16,
    pub status: String,
    pub owner_tab_id: Option<String>,
    pub conflicting_pid: Option<u32>,
    pub conflicting_process_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardToggleResultDto {
    pub rule_id: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteResultDto {
    pub deleted: bool,
}
