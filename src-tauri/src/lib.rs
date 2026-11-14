pub mod db;
pub mod ipc;
pub mod keys;
pub mod os;
pub mod pty;
pub mod security;
pub mod ssh;
pub mod telemetry;

use tauri::{Manager, RunEvent};
use tracing::info;

use crate::db::Database;
use crate::ipc::commands::{
    app_get_status, clipboard_read_text, clipboard_write_text, host_create, host_delete,
    host_duplicate, host_get_detail, host_group_create, host_group_delete, host_group_list,
    host_list, host_move_group, host_update, key_delete, key_generate, key_get_default, key_import,
    key_list, key_set_default, port_forward_delete, port_forward_probe, port_forward_toggle,
    port_forward_upsert, session_connect, session_disconnect, session_reconnect,
    session_resize_pty, session_submit_host_key, session_submit_secret, session_write_stdin,
    telemetry_set_local_config, window_close, window_minimize, window_set_launch_size,
    window_toggle_maximize, AppState,
};
use crate::os::elevated_pty::{run_elevated_worker, ELEVATED_PTY_FLAG};
use crate::os::JobObjectSupervisor;
use crate::pty::PtySessionManager;

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
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve application data directory");

            info!(
                "Initializing SQLite WAL database at {:?}",
                app_data_dir.join("data").join("app.db")
            );
            let db = Database::init(&app_data_dir)
                .expect("Failed to initialize SQLite database and schema");

            let pty_manager = PtySessionManager::new(job_supervisor.clone());

            if let Some(main_win) = app.get_webview_window("main") {
                crate::os::configure_main_window(&main_win);
            }

            app.manage(AppState { db, pty_manager });
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
            host_move_group,
            key_list,
            key_get_default,
            key_generate,
            key_import,
            key_set_default,
            key_delete,
            telemetry_set_local_config,
            port_forward_upsert,
            port_forward_toggle,
            port_forward_delete,
            port_forward_probe,
            session_connect,
            session_write_stdin,
            session_resize_pty,
            session_submit_secret,
            session_submit_host_key,
            session_reconnect,
            session_disconnect,
            app_get_status,
            clipboard_read_text,
            clipboard_write_text,
            window_set_launch_size,
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
            }
        }
    });
}
