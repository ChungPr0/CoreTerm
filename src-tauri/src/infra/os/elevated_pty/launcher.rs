use std::io;
use std::sync::Arc;

use rand_core::{OsRng, RngCore};
use windows_sys::Win32::Foundation::{GetLastError, ERROR_CANCELLED};
use windows_sys::Win32::Storage::FileSystem::{PIPE_ACCESS_INBOUND, PIPE_ACCESS_OUTBOUND};
use windows_sys::Win32::System::Com::{
    CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

use super::pipe::{
    begin_overlapped_connect, create_server_pipe, to_wide, wait_connect_event,
    ElevatedPtyConnection, OverlappedPipe, OwnedHandle, PipeReader,
};
use super::protocol::{FRAME_DATA, FRAME_ERROR};
use super::ELEVATED_PTY_FLAG;
use crate::core::defaults::{MIN_PTY_COLS, MIN_PTY_ROWS};

fn hex_random(bytes_len: usize) -> String {
    let mut raw = vec![0u8; bytes_len];
    OsRng.fill_bytes(&mut raw);
    let mut out = String::with_capacity(bytes_len * 2);
    for b in raw {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

pub(super) fn quote_win32_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '\n', '\r', '"']) {
        return arg.to_string();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for ch in arg.chars() {
        if ch == '\\' {
            backslashes += 1;
        } else if ch == '"' {
            out.push_str(&"\\".repeat(backslashes * 2 + 1));
            out.push('"');
            backslashes = 0;
        } else {
            if backslashes > 0 {
                out.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
            }
            out.push(ch);
        }
    }
    if backslashes > 0 {
        out.push_str(&"\\".repeat(backslashes * 2));
    }
    out.push('"');
    out
}

/// Spawns a hidden UAC-elevated worker of this binary and bridges its ConPTY via Named Pipes.
pub fn spawn_elevated_pty(
    cols: u16,
    rows: u16,
    executable: &str,
    args: &[String],
) -> Result<ElevatedPtyConnection, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve executable path: {e}"))?;
    let exe_str = exe_path.to_string_lossy().to_string();

    let id = hex_random(12);
    let secret = hex_random(32);
    let pipe_base = format!(r"\\.\pipe\coreterm_{id}");
    let pipe_in_name = format!("{pipe_base}_in");
    let pipe_out_name = format!("{pipe_base}_out");

    let pipe_in_handle = create_server_pipe(&pipe_in_name, PIPE_ACCESS_OUTBOUND)?;
    let pipe_out_handle = create_server_pipe(&pipe_out_name, PIPE_ACCESS_INBOUND)?;

    let out_pending = begin_overlapped_connect(pipe_out_handle.0)?;
    let in_pending = begin_overlapped_connect(pipe_in_handle.0)?;

    let mut arg_parts = vec![
        ELEVATED_PTY_FLAG.to_string(),
        "--pipe".to_string(),
        quote_win32_arg(&pipe_base),
        "--cols".to_string(),
        cols.max(MIN_PTY_COLS).to_string(),
        "--rows".to_string(),
        rows.max(MIN_PTY_ROWS).to_string(),
        "--secret".to_string(),
        secret.clone(),
        "--parent-pid".to_string(),
        std::process::id().to_string(),
        "--exe".to_string(),
        quote_win32_arg(executable),
    ];
    for arg in args {
        arg_parts.push("--arg".to_string());
        arg_parts.push(quote_win32_arg(arg));
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        if !home.trim().is_empty() {
            arg_parts.push("--cwd".to_string());
            arg_parts.push(quote_win32_arg(&home));
        }
    }
    let params_str = arg_parts.join(" ");

    let verb_w = to_wide("runas");
    let file_w = to_wide(&exe_str);
    let params_w = to_wide(&params_str);

    // Run ShellExecuteExW on a dedicated STA thread to host UAC cleanly.
    let worker_proc = std::thread::spawn(move || -> Result<OwnedHandle, String> {
        unsafe {
            let hr = CoInitializeEx(
                std::ptr::null(),
                (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
            );
            let mut sei: SHELLEXECUTEINFOW = std::mem::zeroed();
            sei.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            sei.fMask = SEE_MASK_NOCLOSEPROCESS;
            sei.lpVerb = verb_w.as_ptr();
            sei.lpFile = file_w.as_ptr();
            sei.lpParameters = params_w.as_ptr();
            sei.nShow = SW_HIDE;

            let ok = ShellExecuteExW(&mut sei);
            let err = GetLastError();
            if hr >= 0 {
                CoUninitialize();
            }

            if ok == 0 {
                if err == ERROR_CANCELLED {
                    return Err("UAC_CANCELLED".to_string());
                }
                return Err(format!(
                    "Failed to request Administrator elevation: {}",
                    io::Error::from_raw_os_error(err as i32)
                ));
            }
            if sei.hProcess.is_null() {
                return Err("Elevation launched without process handle".to_string());
            }
            Ok(OwnedHandle(sei.hProcess))
        }
    })
    .join()
    .map_err(|_| "Elevation thread panicked".to_string())??;

    wait_connect_event(out_pending, Some(worker_proc.0), 20_000)?;
    wait_connect_event(in_pending, Some(worker_proc.0), 10_000)?;

    let pipe_out = Arc::new(OverlappedPipe::from_handle(pipe_out_handle));
    let pipe_in = Arc::new(OverlappedPipe::from_handle(pipe_in_handle));

    let mut reader = PipeReader(pipe_out.clone());
    match reader
        .read_next_frame()
        .map_err(|e| format!("Failed to verify elevated worker handshake: {e}"))?
    {
        Some((FRAME_DATA, payload)) if payload == secret.as_bytes() => {}
        Some((FRAME_ERROR, payload)) => {
            return Err(String::from_utf8_lossy(&payload).to_string());
        }
        _ => return Err("Invalid elevated worker handshake".to_string()),
    }

    Ok(ElevatedPtyConnection { pipe_in, pipe_out })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quote_win32_arg_spaces_and_backslashes() {
        assert_eq!(quote_win32_arg("simple"), "simple");
        assert_eq!(
            quote_win32_arg(r"C:\Users\My Name\dir\"),
            r#""C:\Users\My Name\dir\\""#
        );
    }
}
