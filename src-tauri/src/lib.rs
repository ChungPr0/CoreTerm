pub mod core;
pub mod hosts;
pub mod infra;
pub mod ipc;
pub mod keys;
pub mod pty;
pub mod sftp;
pub mod ssh;

use tauri::{Manager, RunEvent};
use tracing::info;

use crate::core::defaults::{DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS};
use crate::hosts::HostService;
use crate::infra::db::SqliteDb;
use crate::infra::security::SecretVault;
use crate::keys::KeyService;
use crate::ipc::commands::{
    app_get_status, check_shell_exe, clipboard_read_text, clipboard_write_text,
    detect_available_shells, host_create, host_delete, host_duplicate, host_get_detail,
    host_group_create, host_group_delete, host_group_list, host_group_reorder, host_list,
    host_move_group, host_update, key_delete, key_generate, key_get_default, key_import, key_list,
    key_set_default, local_create_dir, local_delete, local_home_dir, local_list_dir,
    local_list_drives, local_rename, port_forward_delete, port_forward_probe,
    port_forward_toggle, port_forward_upsert, session_connect, session_disconnect,
    session_reconnect, session_resize_pty, session_submit_host_key, session_submit_secret,
    session_write_stdin, sftp_cancel_transfer, sftp_chmod, sftp_clear_finished_transfers,
    sftp_connect, sftp_create_dir, sftp_delete, sftp_disconnect, sftp_download, sftp_list_dir,
    sftp_list_transfers, sftp_pause_transfer, sftp_rename, sftp_resolve_conflict,
    sftp_resume_transfer, sftp_submit_host_key, sftp_submit_secret, sftp_upload, window_close,
    window_is_maximized, window_minimize, window_present, window_set_launch_size,
    window_sys_command, window_toggle_maximize, AppState,
};
use crate::infra::os::elevated_pty::{run_elevated_worker, ELEVATED_PTY_FLAG};
use crate::infra::os::JobObjectSupervisor;
use crate::pty::PtySessionManager;
use crate::sftp::SftpSessionManager;

/// Runs elevated ConPTY named-pipe relay and skips GUI bootstrap when invoked via UAC helper flag.
pub fn maybe_run_elevated_worker() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(|a| a.as_str()) == Some(ELEVATED_PTY_FLAG) {
        Some(run_elevated_worker(&args[1..]))
    } else {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    let job_supervisor =
        JobObjectSupervisor::new().expect("Failed to initialize Windows Job Object Supervisor");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve application data directory");

            info!(
                "Initializing SQLite WAL database at {:?}",
                app_data_dir.join("data").join("app.db")
            );
            let db = SqliteDb::init(&app_data_dir)
                .expect("Failed to initialize SQLite database and schema");
            let vault = SecretVault::new();
            let hosts = HostService::new(db.clone(), vault.clone());
            let keys = KeyService::new(db, vault, &app_data_dir)
                .expect("Failed to initialize SSH key storage");

            let pty_manager = PtySessionManager::new(job_supervisor.clone());
            pty_manager.prewarm_local_shell(DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS);
            let shell_scan_manager = pty_manager.clone();
            tauri::async_runtime::spawn(async move {
                let _ = shell_scan_manager.detect_available_shells(false).await;
            });
            let sftp_manager = SftpSessionManager::new();

            if let Some(main_win) = app.get_webview_window("main") {
                crate::infra::os::configure_main_window(&main_win);
                let fallback_win = main_win.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
                    if !fallback_win.is_visible().unwrap_or(false) {
                        let _ = fallback_win.show();
                    }
                });
            }

            app.manage(AppState {
                hosts,
                keys,
                pty_manager,
                sftp_manager,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            host_list,
            host_get_detail,
            host_create,
            host_update,
            host_duplicate,
            host_delete,
            host_group_list,
            host_group_create,
            host_group_delete,
            host_group_reorder,
            host_move_group,
            key_list,
            key_get_default,
            key_generate,
            key_import,
            key_set_default,
            key_delete,
            port_forward_upsert,
            port_forward_toggle,
            port_forward_delete,
            port_forward_probe,
            detect_available_shells,
            check_shell_exe,
            session_connect,
            session_write_stdin,
            session_resize_pty,
            session_submit_secret,
            session_submit_host_key,
            session_reconnect,
            session_disconnect,
            sftp_connect,
            sftp_disconnect,
            sftp_submit_secret,
            sftp_submit_host_key,
            sftp_list_dir,
            sftp_create_dir,
            sftp_rename,
            sftp_delete,
            sftp_chmod,
            local_list_drives,
            local_home_dir,
            local_list_dir,
            local_create_dir,
            local_rename,
            local_delete,
            sftp_upload,
            sftp_download,
            sftp_pause_transfer,
            sftp_resume_transfer,
            sftp_cancel_transfer,
            sftp_resolve_conflict,
            sftp_list_transfers,
            sftp_clear_finished_transfers,
            app_get_status,
            clipboard_read_text,
            clipboard_write_text,
            window_set_launch_size,
            window_present,
            window_is_maximized,
            window_sys_command,
            window_minimize,
            window_toggle_maximize,
            window_close,
        ])
        .build(tauri::generate_context!())
        .expect("Error while building Tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.pty_manager.shutdown_all();
                state.sftp_manager.shutdown_all();
            }
        }
    });
}
