pub mod bootstrap;
pub mod core;
pub mod hosts;
pub mod infra;
pub mod ipc;
pub mod keys;
pub mod pty;
pub mod sftp;
pub mod ssh;

pub use bootstrap::{
    maybe_run_cli_helpers, parse_clean_launch_dir, parse_clean_launch_target,
    parse_clean_launch_target_with_base, LaunchTarget,
};

use tauri::{Emitter, Manager, RunEvent};
use tracing::info;

use crate::core::defaults::{
    DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS, FALLBACK_WINDOW_SHOW_MS,
};
use crate::hosts::HostService;
use crate::infra::db::SqliteDb;
use crate::infra::os::JobObjectSupervisor;
use crate::infra::security::{SecretVault, TabSecretStore};
use crate::ipc::commands::{
    app_get_launch_dir, app_get_launch_files, app_get_status, check_shell_exe,
    clipboard_read_text, clipboard_write_text, context_menu_get_status, context_menu_set_enabled,
    detect_available_shells, host_create, host_delete, host_duplicate, host_get_detail,
    host_group_create, host_group_delete, host_group_list, host_group_reorder, host_list,
    host_move_group, host_update, key_delete, key_generate, key_get_default, key_import, key_list,
    key_set_default, local_create_dir, local_create_file, local_delete, local_home_dir,
    local_list_dir, local_list_drives, local_read_file, local_rename, local_write_file,
    port_check_available, port_forward_delete, port_forward_probe, port_forward_toggle,
    port_forward_upsert, session_connect, session_disconnect, session_reconnect,
    session_resize_pty, session_submit_host_key, session_submit_secret, session_write_stdin,
    sftp_cancel_transfer, sftp_chmod, sftp_clear_finished_transfers, sftp_connect,
    sftp_create_dir, sftp_create_file, sftp_delete, sftp_disconnect, sftp_download, sftp_list_dir,
    sftp_list_transfers, sftp_pause_transfer, sftp_read_file, sftp_rename, sftp_resolve_conflict,
    sftp_resume_transfer, sftp_submit_host_key, sftp_submit_secret, sftp_upload, sftp_write_file,
    startup_get_status, startup_set_enabled, startup_sync_prefs, window_apply_ime_mode,
    window_close, window_get_position, window_get_size, window_is_fullscreen, window_is_maximized,
    window_minimize, window_open_url, window_present, window_restore_focus,
    window_set_always_on_top, window_set_launch_size, window_set_position, window_set_size,
    window_set_title, window_sys_command, window_toggle_fullscreen, window_toggle_maximize,
    AppState,
};
use crate::ipc::events::{
    EVENT_OPEN_DIRECTORY, EVENT_OPEN_FILE, EVENT_OPEN_NEW_TAB, EVENT_WINDOW_CLOSE_REQUESTED,
};
use crate::keys::KeyService;
use crate::pty::PtySessionManager;
use crate::sftp::SftpSessionManager;

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

    let force_new_window = std::env::args().skip(1).any(|arg| arg == "--new-window");

    let mut builder = tauri::Builder::default();
    if !force_new_window {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let base_dir = std::path::Path::new(&cwd);
            let targets: Vec<LaunchTarget> = argv
                .into_iter()
                .skip(1)
                .filter_map(|arg| parse_clean_launch_target_with_base(&arg, Some(base_dir)))
                .collect();

            let live_prefs = app
                .path()
                .app_data_dir()
                .ok()
                .map(|dir| crate::infra::os::startup_prefs::read_startup_prefs_from_dir(&dir))
                .unwrap_or_default();
            if live_prefs.new_instance_behavior == "new_window" {
                if let Ok(exe) = std::env::current_exe() {
                    let mut cmd = std::process::Command::new(exe);
                    cmd.arg("--new-window");
                    for target in &targets {
                        match target {
                            LaunchTarget::Directory(dir) => {
                                cmd.arg(dir);
                            }
                            LaunchTarget::File(file) => {
                                cmd.arg(file);
                            }
                        }
                    }
                    if !cwd.is_empty() && base_dir.is_dir() {
                        cmd.current_dir(base_dir);
                    }
                    let _ = cmd.spawn();
                }
                return;
            }

            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
                let _ = main_win.unminimize();
                let _ = main_win.set_focus();
            }
            if targets.is_empty() {
                let _ = app.emit(EVENT_OPEN_NEW_TAB, ());
                return;
            }
            for target in targets {
                match target {
                    LaunchTarget::Directory(dir) => {
                        let _ = app.emit(EVENT_OPEN_DIRECTORY, dir);
                    }
                    LaunchTarget::File(file) => {
                        let _ = app.emit(EVENT_OPEN_FILE, file);
                    }
                }
            }
        }));
    }

    let app = builder
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

            let tab_secrets = TabSecretStore::new();
            let pty_manager = PtySessionManager::new(job_supervisor.clone(), tab_secrets.clone());
            pty_manager.prewarm_local_shell(DEFAULT_TERM_COLS, DEFAULT_TERM_ROWS);
            let shell_scan_manager = pty_manager.clone();
            tauri::async_runtime::spawn(async move {
                let _ = shell_scan_manager.detect_available_shells(false).await;
            });
            let sftp_manager = SftpSessionManager::new(tab_secrets.clone());

            if let Some(main_win) = app.get_webview_window("main") {
                crate::infra::os::configure_main_window(&main_win);
                let close_win = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if !crate::infra::os::is_window_close_allowed()
                            && close_win.is_visible().unwrap_or(false)
                        {
                            api.prevent_close();
                            let _ = close_win.emit(EVENT_WINDOW_CLOSE_REQUESTED, ());
                        }
                    }
                });
                let fallback_win = main_win.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        FALLBACK_WINDOW_SHOW_MS,
                    ))
                    .await;
                    if !fallback_win.is_visible().unwrap_or(false) {
                        let _ = fallback_win.show();
                    }
                });
            }

            let mut launch_dir: Option<String> = None;
            let mut launch_files: Vec<String> = Vec::new();
            for target in std::env::args()
                .skip(1)
                .filter_map(|arg| parse_clean_launch_target(&arg))
            {
                match target {
                    LaunchTarget::Directory(dir) => {
                        if launch_dir.is_none() {
                            launch_dir = Some(dir);
                        }
                    }
                    LaunchTarget::File(file) => {
                        launch_files.push(file);
                    }
                }
            }

            crate::infra::os::context_menu::sync_context_menu_if_enabled(&app_data_dir);
            crate::infra::os::startup::sync_startup_if_enabled();

            app.manage(AppState {
                hosts,
                keys,
                tab_secrets,
                pty_manager,
                sftp_manager,
                launch_dir,
                launch_files,
                is_secondary_window: force_new_window,
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
            port_check_available,
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
            sftp_create_file,
            sftp_read_file,
            sftp_write_file,
            sftp_rename,
            sftp_delete,
            sftp_chmod,
            local_list_drives,
            local_home_dir,
            local_list_dir,
            local_create_dir,
            local_create_file,
            local_read_file,
            local_write_file,
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
            app_get_launch_dir,
            app_get_launch_files,
            context_menu_get_status,
            context_menu_set_enabled,
            startup_get_status,
            startup_set_enabled,
            startup_sync_prefs,
            clipboard_read_text,
            clipboard_write_text,
            window_set_launch_size,
            window_present,
            window_restore_focus,
            window_set_always_on_top,
            window_toggle_fullscreen,
            window_is_fullscreen,
            window_set_title,
            window_apply_ime_mode,
            window_is_maximized,
            window_get_position,
            window_set_position,
            window_get_size,
            window_set_size,
            window_sys_command,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_open_url,
        ])
        .build(tauri::generate_context!())
        .expect("Error while building Tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.pty_manager.shutdown_all();
                state.sftp_manager.shutdown_all();
                state.tab_secrets.clear_all();
            }
        }
    });
}
