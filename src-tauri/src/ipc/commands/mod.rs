pub mod hosts;
pub mod keys;
pub mod local_fs;
pub mod session;
pub mod sftp;
pub mod updater;
pub mod window;

pub use hosts::*;
pub use keys::*;
pub use local_fs::*;
pub use session::*;
pub use sftp::*;
pub use updater::*;
pub use window::*;

use crate::hosts::HostService;
use crate::infra::security::TabSecretStore;
use crate::keys::KeyService;
use crate::pty::PtySessionManager;
use crate::sftp::SftpSessionManager;
use crate::updater::UpdaterService;

pub struct AppState {
    pub hosts: HostService,
    pub keys: KeyService,
    pub tab_secrets: TabSecretStore,
    pub pty_manager: PtySessionManager,
    pub sftp_manager: SftpSessionManager,
    pub updater: UpdaterService,
    pub launch_dir: Option<String>,
    pub launch_files: Vec<String>,
    pub is_secondary_window: bool,
}
