use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShellProfile {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub kind: String,
    pub name: String,
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConnectAckDto {
    pub tab_id: String,
    pub host_id: String,
    pub pid: Option<u32>,
    pub cli_preview: String,
    pub status: String,
    pub is_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForwardStatusDto {
    pub rule_id: String,
    pub bind_address: String,
    pub bind_port: u16,
    pub forward_type: String,
    pub status: String,
    pub owner_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatusEventDto {
    pub tab_id: String,
    pub host_id: String,
    pub state: String,
    pub active_local_forwards: Vec<PortForwardStatusDto>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionAuthPromptEventDto {
    pub tab_id: String,
    pub host_id: String,
    pub prompt_type: String,
    pub prompt_text: String,
    pub attempt: u8,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionConnectRequestDto {
    pub tab_id: String,
    pub host_id: String,
    pub cols: u16,
    pub rows: u16,
    pub conflict_strategy: Option<String>,
    pub as_admin: Option<bool>,
    pub shell_profile: Option<ShellProfile>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionReconnectRequestDto {
    pub tab_id: String,
    pub host_id: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub as_admin: Option<bool>,
    pub shell_profile: Option<ShellProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionHostKeyPromptEventDto {
    pub tab_id: String,
    pub host_id: String,
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint: String,
    pub reason: String,
}
