pub mod hosts;
pub mod keys;
pub mod local_fs;
pub mod session;
pub mod sftp;
pub mod telemetry;
pub mod window;

pub use hosts::*;
pub use keys::*;
pub use local_fs::*;
pub use session::*;
pub use sftp::*;
pub use telemetry::*;
pub use window::*;

use crate::hosts::HostService;
use crate::keys::KeyService;
use crate::pty::PtySessionManager;
use crate::sftp::SftpSessionManager;

pub struct AppState {
    pub hosts: HostService,
    pub keys: KeyService,
    pub pty_manager: PtySessionManager,
    pub sftp_manager: SftpSessionManager,
}
