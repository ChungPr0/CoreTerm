// Prevents additional console window on Windows (both debug and release), DO NOT REMOVE!!
#![windows_subsystem = "windows"]

fn main() {
    if let Some(code) = coreterm_lib::maybe_run_cli_helpers() {
        std::process::exit(code);
    }
    #[cfg(windows)]
    unsafe {
        // Detach from any inherited console so no stray terminal window remains open
        windows_sys::Win32::System::Console::FreeConsole();
    }
    coreterm_lib::run()
}
