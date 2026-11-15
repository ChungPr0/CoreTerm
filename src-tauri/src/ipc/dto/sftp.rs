use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpConnectAckDto {
    pub tab_id: String,
    pub host_id: String,
    pub home_path: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpStatusEventDto {
    pub tab_id: String,
    pub host_id: String,
    pub state: String,
    pub cwd: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpAuthPromptEventDto {
    pub tab_id: String,
    pub host_id: String,
    pub prompt_type: String,
    pub prompt_text: String,
    pub attempt: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpHostKeyPromptEventDto {
    pub tab_id: String,
    pub host_id: String,
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpEntryDto {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub symlink_target_is_dir: bool,
    pub size: u64,
    pub mtime_ms: Option<u64>,
    pub permissions: Option<u32>,
    pub permissions_display: String,
    pub owner: Option<String>,
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpListDirResultDto {
    pub path: String,
    pub entries: Vec<SftpEntryDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpTransferJobDto {
    pub job_id: String,
    pub tab_id: String,
    pub direction: String,
    pub source_path: String,
    pub dest_path: String,
    pub file_name: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub speed_bps: u64,
    pub status: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpTransferConflictEventDto {
    pub conflict_id: String,
    pub tab_id: String,
    pub job_id: String,
    pub direction: String,
    pub file_name: String,
    pub source_path: String,
    pub dest_path: String,
    pub source_size: u64,
    pub source_mtime_ms: Option<u64>,
    pub dest_size: u64,
    pub dest_mtime_ms: Option<u64>,
    pub can_resume: bool,
}
