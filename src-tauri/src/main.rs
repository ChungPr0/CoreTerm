// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = coreterm_lib::maybe_run_elevated_worker() {
        std::process::exit(code);
    }
    coreterm_lib::run()
}
