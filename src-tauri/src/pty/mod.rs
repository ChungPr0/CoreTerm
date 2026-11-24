pub mod ansi;
pub mod askpass;
mod direct;
mod events;
pub mod expect;
mod local;
pub mod manager;
mod prewarm;
pub mod shells;
mod spawn;
mod ssh;
mod types;
mod wsl;

pub use manager::PtySessionManager;
pub use shells::{detect_available_shells, resolve_shell_exe};
