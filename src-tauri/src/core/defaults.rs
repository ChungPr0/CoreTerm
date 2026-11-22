//! Shared core terminal dimension, protocol, and runtime defaults.

pub const APP_NAME: &str = "CoreTerm";
pub const KEYRING_SERVICE_NAME: &str = "coreterm";
pub const LOCAL_HOST_ID: &str = "local";
pub const DEFAULT_HOST_GROUP: &str = "Default";
pub const DEFAULT_BIND_ADDRESS: &str = "127.0.0.1";
pub const DEFAULT_SSH_PORT: u16 = 22;
pub const PRIVILEGED_PORT_THRESHOLD: u16 = 1024;

pub const DEFAULT_STRICT_HOST_KEY: &str = "ACCEPT_NEW";
pub const DEFAULT_KEEPALIVE_INTERVAL_SECS: u16 = 60;
pub const DEFAULT_KEEPALIVE_COUNT_MAX: u8 = 3;
pub const DEFAULT_RECONNECT_INTERVAL_SECS: u16 = 2;
pub const MIN_RECONNECT_INTERVAL_SECS: u16 = 1;
pub const MAX_RECONNECT_INTERVAL_SECS: u16 = 60;

pub const MAX_GROUP_NAME_LEN: usize = 64;
pub const MAX_KEY_NAME_LEN: usize = 64;

pub const DEFAULT_TERM_COLS: u16 = 120;
pub const DEFAULT_TERM_ROWS: u16 = 30;

pub const MIN_LAUNCH_COLS: u16 = 40;
pub const MAX_LAUNCH_COLS: u16 = 200;
pub const MIN_LAUNCH_ROWS: u16 = 10;
pub const MAX_LAUNCH_ROWS: u16 = 50;

pub const MIN_PTY_COLS: u16 = 10;
pub const MIN_PTY_ROWS: u16 = 2;

pub const SSH_CONNECT_TIMEOUT_SECS: u64 = 8;
pub const SFTP_IO_TIMEOUT_SECS: u64 = 30;
pub const SFTP_DRIVE_PROBE_TIMEOUT_SECS: u64 = 2;
pub const WSL_LIST_TIMEOUT_MS: u64 = 1500;
pub const SQLITE_BUSY_TIMEOUT_MS: u64 = 5000;
pub const FALLBACK_WINDOW_SHOW_MS: u64 = 1200;

pub const PTY_READ_BUF_BYTES: usize = 16 * 1024;
pub const SFTP_COPY_CHUNK_BYTES: usize = 128 * 1024;
pub const SFTP_PROGRESS_EMIT_INTERVAL_MS: u128 = 150;
pub const MAX_CONCURRENT_TRANSFERS: usize = 2;
pub const SFTP_MAX_WALK_DEPTH: usize = 64;
pub const SFTP_MAX_WALK_ENTRIES: usize = 50_000;
