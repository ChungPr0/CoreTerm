use crate::infra::os::InstallKind;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateEnvDto {
    pub current_version: String,
    pub install_kind: InstallKind,
    pub can_install_in_app: bool,
    pub supports_silent_auto_download: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResultDto {
    pub available: bool,
    pub current_version: String,
    pub install_kind: InstallKind,
    pub version: Option<String>,
    pub tag_name: Option<String>,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
    pub release_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
    pub can_install_in_app: bool,
    pub is_downloaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDownloadProgressDto {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDownloadResultDto {
    pub version: String,
    pub ready: bool,
}
