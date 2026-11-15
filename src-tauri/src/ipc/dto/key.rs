use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshKeyDto {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub private_key_path: String,
    pub public_key_content: Option<String>,
    pub fingerprint: String,
    pub has_passphrase: bool,
    pub has_saved_passphrase: bool,
    pub is_default: bool,
    pub file_exists: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateSshKeyRequestDto {
    pub name: String,
    pub key_type: String,
    pub comment: Option<String>,
    pub passphrase: Option<String>,
    #[serde(default)]
    pub set_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSshKeyRequestDto {
    pub name: String,
    pub source_path: String,
    #[serde(default)]
    pub copy_to_managed_dir: bool,
    pub passphrase: Option<String>,
    #[serde(default)]
    pub set_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDefaultKeyResultDto {
    pub updated: bool,
}
