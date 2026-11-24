//! Centralized Tauri IPC event channel names.

pub const EVENT_SESSION_STATUS: &str = "session:status";
pub const EVENT_SESSION_AUTH_PROMPT: &str = "session:auth_prompt";
pub const EVENT_SESSION_HOST_KEY_PROMPT: &str = "session:host_key_prompt";
pub const EVENT_HOST_UPDATED: &str = "host:updated";

pub const EVENT_SFTP_STATUS: &str = "sftp:status";
pub const EVENT_SFTP_AUTH_PROMPT: &str = "sftp:auth_prompt";
pub const EVENT_SFTP_HOST_KEY_PROMPT: &str = "sftp:host_key_prompt";
pub const EVENT_SFTP_TRANSFER_PROGRESS: &str = "sftp:transfer_progress";
pub const EVENT_SFTP_TRANSFER_CONFLICT: &str = "sftp:transfer_conflict";

pub const EVENT_OPEN_DIRECTORY: &str = "open-directory";
pub const EVENT_OPEN_FILE: &str = "open-file";
pub const EVENT_OPEN_NEW_TAB: &str = "open-new-tab";
