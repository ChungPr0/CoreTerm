pub mod acl;
pub mod clipboard;
pub mod context_menu;
pub mod elevated_pty;
pub mod elevation;
pub mod job_object;
pub mod known_folders;
pub mod startup;
pub mod startup_prefs;
pub mod window;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub use acl::{restrict_private_key_acl, restrict_private_key_dir_acl};
pub use elevation::is_process_elevated;
pub use job_object::JobObjectSupervisor;
pub use known_folders::{system32_binary, system32_dir};
pub use window::{configure_main_window, has_native_window_border};
