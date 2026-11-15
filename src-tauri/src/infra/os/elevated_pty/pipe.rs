use std::fs::File;
use std::io::{self, Read, Write};
use std::os::windows::io::FromRawHandle;
use std::sync::Arc;

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, LocalFree, ERROR_BROKEN_PIPE, ERROR_IO_PENDING, ERROR_NO_DATA,
    ERROR_PIPE_BUSY, ERROR_PIPE_CONNECTED, HANDLE, HLOCAL, INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, ReadFile, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_FLAG_OVERLAPPED, OPEN_EXISTING,
};
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT,
};
use windows_sys::Win32::System::Threading::{
    CreateEventW, WaitForMultipleObjects, WaitForSingleObject,
};

use super::protocol::read_frame;

const SDDL_REVISION_1: u32 = 1;

pub(super) struct OwnedHandle(pub(super) HANDLE);
unsafe impl Send for OwnedHandle {}
unsafe impl Sync for OwnedHandle {}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

/// Overlapped unidirectional Windows Named Pipe with deterministic cancellation support.
pub struct OverlappedPipe {
    handle: OwnedHandle,
}

impl OverlappedPipe {
    pub(super) fn from_handle(handle: OwnedHandle) -> Self {
        Self { handle }
    }

    fn read_some(&self, buf: &mut [u8]) -> io::Result<usize> {
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            if event.is_null() {
                return Err(io::Error::last_os_error());
            }
            let _ev_guard = OwnedHandle(event);

            let mut ov: Box<OVERLAPPED> = Box::new(std::mem::zeroed());
            ov.hEvent = event;

            let mut read_bytes = 0u32;
            let ok = ReadFile(
                self.handle.0,
                buf.as_mut_ptr(),
                buf.len() as u32,
                &mut read_bytes,
                &mut *ov,
            );
            if ok == 0 {
                let err = GetLastError();
                if err == ERROR_BROKEN_PIPE || err == ERROR_NO_DATA {
                    return Ok(0);
                }
                if err != ERROR_IO_PENDING {
                    return Err(io::Error::from_raw_os_error(err as i32));
                }
                let res = GetOverlappedResult(self.handle.0, &*ov, &mut read_bytes, 1);
                if res == 0 {
                    let res_err = GetLastError();
                    if res_err == ERROR_BROKEN_PIPE || res_err == ERROR_NO_DATA {
                        return Ok(0);
                    }
                    return Err(io::Error::from_raw_os_error(res_err as i32));
                }
            }
            Ok(read_bytes as usize)
        }
    }

    fn write_some(&self, buf: &[u8]) -> io::Result<usize> {
        unsafe {
            let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
            if event.is_null() {
                return Err(io::Error::last_os_error());
            }
            let _ev_guard = OwnedHandle(event);

            let mut ov: Box<OVERLAPPED> = Box::new(std::mem::zeroed());
            ov.hEvent = event;

            let mut written = 0u32;
            let ok = WriteFile(
                self.handle.0,
                buf.as_ptr(),
                buf.len() as u32,
                &mut written,
                &mut *ov,
            );
            if ok == 0 {
                let err = GetLastError();
                if err != ERROR_IO_PENDING {
                    return Err(io::Error::from_raw_os_error(err as i32));
                }
                let res = GetOverlappedResult(self.handle.0, &*ov, &mut written, 1);
                if res == 0 {
                    return Err(io::Error::from_raw_os_error(GetLastError() as i32));
                }
            }
            Ok(written as usize)
        }
    }

    pub fn cancel(&self) {
        unsafe {
            let _ = CancelIoEx(self.handle.0, std::ptr::null());
        }
    }
}

pub struct PipeWriter(pub Arc<OverlappedPipe>);

impl Write for PipeWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write_some(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub struct PipeReader(pub Arc<OverlappedPipe>);

impl Read for PipeReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.0.read_some(buf)
    }
}

impl PipeReader {
    pub fn read_next_frame(&mut self) -> io::Result<Option<(u8, Vec<u8>)>> {
        read_frame(self)
    }
}

pub struct ElevatedPtyConnection {
    pub pipe_in: Arc<OverlappedPipe>,
    pub pipe_out: Arc<OverlappedPipe>,
}

pub(super) fn to_wide(s: &str) -> Vec<u16> {
    let mut v: Vec<u16> = s.encode_utf16().collect();
    v.push(0);
    v
}

pub(super) fn create_server_pipe(name: &str, access_flags: u32) -> Result<OwnedHandle, String> {
    let wide_name = to_wide(name);
    // Restrict pipe access to SYSTEM, Builtin Administrators, and Owner.
    let sddl = to_wide("D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;OW)");
    let mut sd: *mut core::ffi::c_void = std::ptr::null_mut();

    unsafe {
        let sd_ok = ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut sd,
            std::ptr::null_mut(),
        );
        let sa = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: if sd_ok != 0 { sd } else { std::ptr::null_mut() },
            bInheritHandle: 0,
        };

        let handle = CreateNamedPipeW(
            wide_name.as_ptr(),
            access_flags | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            1,
            65536,
            65536,
            0,
            &sa,
        );

        if !sd.is_null() {
            let _ = LocalFree(sd as HLOCAL);
        }

        if handle.is_null() || handle == INVALID_HANDLE_VALUE {
            return Err(format!(
                "CreateNamedPipeW failed for {name}: {}",
                io::Error::last_os_error()
            ));
        }
        Ok(OwnedHandle(handle))
    }
}

/// Keeps heap OVERLAPPED alive until ConnectNamedPipe finishes or is cancelled.
pub(super) struct PendingConnect {
    pipe: HANDLE,
    ov: Box<OVERLAPPED>,
    event: OwnedHandle,
    completed: bool,
}

impl Drop for PendingConnect {
    fn drop(&mut self) {
        if !self.completed {
            unsafe {
                let _ = CancelIoEx(self.pipe, &*self.ov);
                let mut dummy = 0u32;
                let _ = GetOverlappedResult(self.pipe, &*self.ov, &mut dummy, 1);
            }
        }
    }
}

pub(super) fn begin_overlapped_connect(pipe: HANDLE) -> Result<Option<PendingConnect>, String> {
    unsafe {
        let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
        if event.is_null() {
            return Err(format!("CreateEventW failed: {}", io::Error::last_os_error()));
        }
        let ev_guard = OwnedHandle(event);

        let mut ov: Box<OVERLAPPED> = Box::new(std::mem::zeroed());
        ov.hEvent = event;
        let ok = ConnectNamedPipe(pipe, &mut *ov);
        if ok != 0 {
            return Ok(None);
        }
        let err = GetLastError();
        if err == ERROR_PIPE_CONNECTED {
            return Ok(None);
        }
        if err == ERROR_IO_PENDING {
            return Ok(Some(PendingConnect {
                pipe,
                ov,
                event: ev_guard,
                completed: false,
            }));
        }
        Err(format!(
            "ConnectNamedPipe failed: {}",
            io::Error::from_raw_os_error(err as i32)
        ))
    }
}

pub(super) fn wait_connect_event(
    pending_opt: Option<PendingConnect>,
    worker_proc: Option<HANDLE>,
    timeout_ms: u32,
) -> Result<(), String> {
    let Some(mut pending) = pending_opt else {
        return Ok(());
    };
    unsafe {
        let wait_res = if let Some(proc_handle) = worker_proc {
            let handles = [pending.event.0, proc_handle];
            WaitForMultipleObjects(2, handles.as_ptr(), 0, timeout_ms)
        } else {
            WaitForSingleObject(pending.event.0, timeout_ms)
        };

        if wait_res == WAIT_OBJECT_0 {
            let mut bytes = 0u32;
            let ok = GetOverlappedResult(pending.pipe, &*pending.ov, &mut bytes, 1);
            pending.completed = true;
            if ok == 0 {
                return Err(format!(
                    "Overlapped pipe connect failed: {}",
                    io::Error::last_os_error()
                ));
            }
            Ok(())
        } else {
            let _ = CancelIoEx(pending.pipe, &*pending.ov);
            let mut dummy = 0u32;
            let _ = GetOverlappedResult(pending.pipe, &*pending.ov, &mut dummy, 1);
            pending.completed = true;
            if worker_proc.is_some() && wait_res == WAIT_OBJECT_0 + 1 {
                Err("Elevated terminal worker exited before connecting".to_string())
            } else {
                Err("Timed out waiting for elevated terminal handshake".to_string())
            }
        }
    }
}

pub(super) fn open_client_pipe(name: &str, access: u32) -> Result<File, String> {
    let wide = to_wide(name);
    for attempt in 0..5 {
        unsafe {
            let handle = CreateFileW(
                wide.as_ptr(),
                access,
                0,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                std::ptr::null_mut(),
            );
            if !handle.is_null() && handle != INVALID_HANDLE_VALUE {
                return Ok(File::from_raw_handle(handle as _));
            }
            let err = io::Error::last_os_error();
            if err.raw_os_error() == Some(ERROR_PIPE_BUSY as i32) && attempt < 4 {
                std::thread::sleep(std::time::Duration::from_millis(20));
                continue;
            }
            return Err(format!("Failed to open named pipe {name}: {err}"));
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::os::elevated_pty::protocol::{
        read_frame, write_frame, FRAME_DATA, FRAME_EXIT,
    };
    use std::time::Duration;
    use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
    use windows_sys::Win32::Storage::FileSystem::{PIPE_ACCESS_INBOUND, PIPE_ACCESS_OUTBOUND};

    #[test]
    fn test_overlapped_named_pipe_connect_and_roundtrip() {
        let _ = crate::infra::os::is_process_elevated();

        let id = format!("test_{}", std::process::id());
        let pipe_in_name = format!(r"\\.\pipe\coreterm_{id}_in");
        let pipe_out_name = format!(r"\\.\pipe\coreterm_{id}_out");

        let pipe_in_handle = create_server_pipe(&pipe_in_name, PIPE_ACCESS_OUTBOUND).unwrap();
        let pipe_out_handle = create_server_pipe(&pipe_out_name, PIPE_ACCESS_INBOUND).unwrap();

        let out_pending = begin_overlapped_connect(pipe_out_handle.0).unwrap();
        let in_pending = begin_overlapped_connect(pipe_in_handle.0).unwrap();

        let client_out_name = pipe_out_name.clone();
        let client_in_name = pipe_in_name.clone();
        let client = std::thread::spawn(move || {
            // Delay client connect to exercise ERROR_IO_PENDING completion.
            std::thread::sleep(Duration::from_millis(40));
            let mut out_file = open_client_pipe(&client_out_name, GENERIC_WRITE).unwrap();
            let mut in_file = open_client_pipe(&client_in_name, GENERIC_READ).unwrap();

            write_frame(&mut out_file, FRAME_DATA, b"handshake-ok").unwrap();
            let incoming = read_frame(&mut in_file).unwrap();
            assert_eq!(incoming, Some((FRAME_DATA, b"ping".to_vec())));
            write_frame(&mut out_file, FRAME_EXIT, &[1, 0, 0, 0, 0]).unwrap();
        });

        wait_connect_event(out_pending, None, 5_000).unwrap();
        wait_connect_event(in_pending, None, 5_000).unwrap();

        let mut reader = PipeReader(Arc::new(OverlappedPipe::from_handle(pipe_out_handle)));
        let mut writer = PipeWriter(Arc::new(OverlappedPipe::from_handle(pipe_in_handle)));

        assert_eq!(
            reader.read_next_frame().unwrap(),
            Some((FRAME_DATA, b"handshake-ok".to_vec()))
        );
        write_frame(&mut writer, FRAME_DATA, b"ping").unwrap();
        assert_eq!(
            reader.read_next_frame().unwrap(),
            Some((FRAME_EXIT, vec![1, 0, 0, 0, 0]))
        );

        client.join().unwrap();
    }
}
