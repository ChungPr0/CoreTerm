use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalDriveDto {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFsEntryDto {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub mtime_ms: Option<u64>,
    pub is_readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalListDirResultDto {
    pub path: String,
    pub entries: Vec<LocalFsEntryDto>,
}
