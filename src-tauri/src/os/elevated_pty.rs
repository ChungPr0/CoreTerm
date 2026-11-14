use std::io::{self, Read, Write};
use std::sync::{Arc, Mutex};

pub const ELEVATED_PTY_FLAG: &str = "--coreterm-elevated-pty";

pub const FRAME_DATA: u8 = 1;
pub const FRAME_RESIZE: u8 = 2;
pub const FRAME_EXIT: u8 = 3;
pub const FRAME_ERROR: u8 = 4;
pub const FRAME_CLOSE: u8 = 5;

const MAX_FRAME_LEN: usize = 16 * 1024 * 1024;

pub fn write_frame<W: Write>(writer: &mut W, tag: u8, payload: &[u8]) -> io::Result<()> {
    let len = u32::try_from(payload.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Frame exceeds u32 max"))?;
    let mut header = [0u8; 5];
    header[0] = tag;
    header[1..5].copy_from_slice(&len.to_le_bytes());
    writer.write_all(&header)?;
    if !payload.is_empty() {
        writer.write_all(payload)?;
    }
    writer.flush()?;
    Ok(())
}

pub fn read_frame<R: Read>(reader: &mut R) -> io::Result<Option<(u8, Vec<u8>)>> {
    let mut header = [0u8; 5];
    match reader.read_exact(&mut header) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof || e.kind() == io::ErrorKind::BrokenPipe => {
            return Ok(None);
        }
        Err(e) => return Err(e),
    }

    let tag = header[0];
    let len = u32::from_le_bytes([header[1], header[2], header[3], header[4]]) as usize;
    if len > MAX_FRAME_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Elevated PTY frame too large: {len}"),
        ));
    }

    let mut payload = vec![0u8; len];
    if len > 0 {
        reader.read_exact(&mut payload)?;
    }
    Ok(Some((tag, payload)))
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use std::fs::File;
    use std::os::windows::io::FromRawHandle;

    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use rand_core::{OsRng, RngCore};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, LocalFree, ERROR_BROKEN_PIPE, ERROR_CANCELLED,
        ERROR_IO_PENDING, ERROR_NO_DATA, ERROR_PIPE_BUSY, ERROR_PIPE_CONNECTED, GENERIC_READ,
        GENERIC_WRITE, HANDLE, HLOCAL, INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, ReadFile, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_FLAG_OVERLAPPED,
        OPEN_EXISTING, PIPE_ACCESS_INBOUND, PIPE_ACCESS_OUTBOUND,
    };
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
    use windows_sys::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT,
    };
    use windows_sys::Win32::System::Threading::{
        CreateEventW, OpenProcess, WaitForMultipleObjects, WaitForSingleObject, INFINITE,
        PROCESS_SYNCHRONIZE,
    };
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

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

    /// Overlapped unidirectional Windows Named Pipe handle with deterministic cancellation support.
    pub struct OverlappedPipe {
        handle: OwnedHandle,
    }

    impl OverlappedPipe {
        #[cfg(test)]
        pub(super) fn from_handle(handle: OwnedHandle) -> Self {
            Self { handle }
        }

        fn read_exact(&self, mut buf: &mut [u8]) -> io::Result<()> {
            while !buf.is_empty() {
                let n = self.read_some(buf)?;
                if n == 0 {
                    return Err(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "Pipe closed",
                    ));
                }
                buf = &mut buf[n..];
            }
            Ok(())
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
            let mut header = [0u8; 5];
            match self.0.read_exact(&mut header) {
                Ok(()) => {}
                Err(e)
                    if e.kind() == io::ErrorKind::UnexpectedEof
                        || e.kind() == io::ErrorKind::BrokenPipe =>
                {
                    return Ok(None);
                }
                Err(e) => return Err(e),
            }

            let tag = header[0];
            let len = u32::from_le_bytes([header[1], header[2], header[3], header[4]]) as usize;
            if len > MAX_FRAME_LEN {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Elevated PTY frame too large: {len}"),
                ));
            }
            let mut payload = vec![0u8; len];
            if len > 0 {
                self.0.read_exact(&mut payload)?;
            }
            Ok(Some((tag, payload)))
        }
    }

    pub struct ElevatedPtyConnection {
        pub pipe_in: Arc<OverlappedPipe>,
        pub pipe_out: Arc<OverlappedPipe>,
    }

    fn to_wide(s: &str) -> Vec<u16> {
        let mut v: Vec<u16> = s.encode_utf16().collect();
        v.push(0);
        v
    }

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

    /// Holds heap-pinned OVERLAPPED storage alive until ConnectNamedPipe finishes or cancels.
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
                return Err(format!(
                    "CreateEventW failed: {}",
                    io::Error::last_os_error()
                ));
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
            } else if worker_proc.is_some() && wait_res == WAIT_OBJECT_0 + 1 {
                let _ = CancelIoEx(pending.pipe, &*pending.ov);
                let mut dummy = 0u32;
                let _ = GetOverlappedResult(pending.pipe, &*pending.ov, &mut dummy, 1);
                pending.completed = true;
                Err("Elevated terminal worker exited before connecting".to_string())
            } else {
                let _ = CancelIoEx(pending.pipe, &*pending.ov);
                let mut dummy = 0u32;
                let _ = GetOverlappedResult(pending.pipe, &*pending.ov, &mut dummy, 1);
                pending.completed = true;
                Err("Timed out waiting for elevated terminal handshake".to_string())
            }
        }
    }

    /// Launches a hidden UAC-elevated worker instance of this binary and bridges its ConPTY over Named Pipes.
    pub fn spawn_elevated_pty(cols: u16, rows: u16) -> Result<ElevatedPtyConnection, String> {
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
            cols.max(10).to_string(),
            "--rows".to_string(),
            rows.max(2).to_string(),
            "--secret".to_string(),
            secret.clone(),
            "--parent-pid".to_string(),
            std::process::id().to_string(),
        ];
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

        // Execute ShellExecuteExW on a dedicated STA thread to host UAC prompt cleanly.
        let shell_res = std::thread::spawn(move || -> Result<OwnedHandle, String> {
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

        wait_connect_event(out_pending, Some(shell_res.0), 20_000)?;
        wait_connect_event(in_pending, Some(shell_res.0), 10_000)?;

        let pipe_out = Arc::new(OverlappedPipe {
            handle: pipe_out_handle,
        });
        let pipe_in = Arc::new(OverlappedPipe {
            handle: pipe_in_handle,
        });

        let mut reader = PipeReader(pipe_out.clone());
        match reader
            .read_next_frame()
            .map_err(|e| format!("Failed to verify elevated worker handshake: {e}"))?
        {
            Some((FRAME_DATA, payload)) if payload == secret.as_bytes() => {}
            Some((FRAME_ERROR, payload)) => {
                let msg = String::from_utf8_lossy(&payload).to_string();
                return Err(msg);
            }
            _ => {
                return Err("Invalid elevated worker handshake".to_string());
            }
        }

        Ok(ElevatedPtyConnection { pipe_in, pipe_out })
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

    #[derive(Default)]
    struct WorkerPtyHandles {
        child: Option<Box<dyn portable_pty::Child + Send + Sync>>,
        master: Option<Box<dyn portable_pty::MasterPty + Send>>,
        job: Option<crate::os::job_object::JobObjectSupervisor>,
    }

    fn shutdown_worker_handles(handles: &Arc<Mutex<WorkerPtyHandles>>) {
        let (master, job) = if let Ok(mut guard) = handles.lock() {
            if let Some(ref mut ch) = guard.child {
                let _ = ch.kill();
            }
            (guard.master.take(), guard.job.take())
        } else {
            (None, None)
        };
        // Drop MasterPty (ClosePseudoConsole) and JobObject outside mutex lock.
        drop(master);
        drop(job);
    }

    fn spawn_parent_watchdog(parent_pid: u32, handles: Arc<Mutex<WorkerPtyHandles>>) {
        unsafe {
            let parent_handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, parent_pid);
            if parent_handle.is_null() {
                std::process::exit(10);
            }
            let guard = OwnedHandle(parent_handle);
            std::thread::spawn(move || {
                let guard = guard;
                let _ = WaitForSingleObject(guard.0, INFINITE);
                shutdown_worker_handles(&handles);
                std::thread::sleep(std::time::Duration::from_millis(100));
                std::process::exit(0);
            });
        }
    }

    /// Entrypoint executed when this binary is launched elevated with `--coreterm-elevated-pty`.
    pub fn run_elevated_worker(args: &[String]) -> i32 {
        let mut pipe_base = String::new();
        let mut cols: u16 = 120;
        let mut rows: u16 = 30;
        let mut secret = String::new();
        let mut cwd: Option<String> = None;
        let mut parent_pid: Option<u32> = None;

        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--pipe" if i + 1 < args.len() => {
                    pipe_base = args[i + 1].clone();
                    i += 2;
                }
                "--cols" if i + 1 < args.len() => {
                    cols = args[i + 1].parse().unwrap_or(120);
                    i += 2;
                }
                "--rows" if i + 1 < args.len() => {
                    rows = args[i + 1].parse().unwrap_or(30);
                    i += 2;
                }
                "--secret" if i + 1 < args.len() => {
                    secret = args[i + 1].clone();
                    i += 2;
                }
                "--cwd" if i + 1 < args.len() => {
                    cwd = Some(args[i + 1].clone());
                    i += 2;
                }
                "--parent-pid" if i + 1 < args.len() => {
                    parent_pid = args[i + 1].parse().ok();
                    i += 2;
                }
                _ => {
                    i += 1;
                }
            }
        }

        if pipe_base.is_empty() || secret.is_empty() {
            return 2;
        }

        let handles = Arc::new(Mutex::new(WorkerPtyHandles::default()));
        if let Some(pid) = parent_pid {
            spawn_parent_watchdog(pid, handles.clone());
        }

        let Ok(pipe_out_file) = open_client_pipe(&format!("{pipe_base}_out"), GENERIC_WRITE) else {
            return 3;
        };
        let Ok(mut pipe_in_file) = open_client_pipe(&format!("{pipe_base}_in"), GENERIC_READ) else {
            return 4;
        };

        let pipe_out = Arc::new(Mutex::new(pipe_out_file));
        {
            let Ok(mut guard) = pipe_out.lock() else {
                return 5;
            };
            if write_frame(&mut *guard, FRAME_DATA, secret.as_bytes()).is_err() {
                return 5;
            }
        }

        let send_error = |msg: &str| {
            if let Ok(mut guard) = pipe_out.lock() {
                let _ = write_frame(&mut *guard, FRAME_ERROR, msg.as_bytes());
            }
        };

        let pty_system = native_pty_system();
        let pair = match pty_system.openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        }) {
            Ok(p) => p,
            Err(e) => {
                send_error(&format!("Failed to open elevated ConPTY: {e}"));
                return 6;
            }
        };

        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.arg("-NoLogo");
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                send_error(&format!("Failed to spawn elevated powershell.exe: {e}"));
                return 7;
            }
        };
        drop(pair.slave);

        let Ok(mut pty_writer) = pair.master.take_writer() else {
            send_error("Failed to acquire elevated PTY writer");
            return 8;
        };
        let Ok(mut pty_reader) = pair.master.try_clone_reader() else {
            send_error("Failed to acquire elevated PTY reader");
            return 9;
        };

        let job = crate::os::job_object::JobObjectSupervisor::new().ok();
        if let (Some(ref j), Some(pid)) = (&job, child.process_id()) {
            let _ = j.assign_pid(pid);
        }

        if let Ok(mut guard) = handles.lock() {
            guard.child = Some(child);
            guard.master = Some(pair.master);
            guard.job = job;
        }

        let handles_ctrl = handles.clone();

        // Stdin & resize control loop; EOF/BrokenPipe kills elevated tree so zero orphans remain.
        std::thread::spawn(move || {
            loop {
                match read_frame(&mut pipe_in_file) {
                    Ok(Some((FRAME_DATA, payload))) => {
                        if pty_writer.write_all(&payload).is_err() || pty_writer.flush().is_err() {
                            break;
                        }
                    }
                    Ok(Some((FRAME_RESIZE, payload))) if payload.len() == 4 => {
                        let c = u16::from_le_bytes([payload[0], payload[1]]);
                        let r = u16::from_le_bytes([payload[2], payload[3]]);
                        if c > 0 && r > 0 {
                            if let Ok(guard) = handles_ctrl.lock() {
                                if let Some(ref m) = guard.master {
                                    let _ = m.resize(PtySize {
                                        rows: r.max(2),
                                        cols: c.max(10),
                                        pixel_width: 0,
                                        pixel_height: 0,
                                    });
                                }
                            }
                        }
                    }
                    Ok(Some((FRAME_CLOSE, _))) | Ok(None) | Err(_) => {
                        shutdown_worker_handles(&handles_ctrl);
                        std::thread::spawn(|| {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            std::process::exit(0);
                        });
                        break;
                    }
                    Ok(Some(_)) => {}
                }
            }
        });

        let mut buf = [0u8; 16 * 1024];
        loop {
            match pty_reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let Ok(mut guard) = pipe_out.lock() else {
                        break;
                    };
                    if write_frame(&mut *guard, FRAME_DATA, &buf[..n]).is_err() {
                        break;
                    }
                }
            }
        }

        let child_opt = handles.lock().ok().and_then(|mut g| g.child.take());
        let exit_code = child_opt
            .and_then(|mut c| c.wait().ok())
            .map(|s| s.exit_code());
        shutdown_worker_handles(&handles);

        if let Ok(mut guard) = pipe_out.lock() {
            let mut payload = [0u8; 5];
            if let Some(code) = exit_code {
                payload[0] = 1;
                payload[1..5].copy_from_slice(&code.to_le_bytes());
            }
            let _ = write_frame(&mut *guard, FRAME_EXIT, &payload);
        }

        0
    }
}

#[cfg(windows)]
pub use win_impl::{
    run_elevated_worker, spawn_elevated_pty, ElevatedPtyConnection, OverlappedPipe, PipeReader,
    PipeWriter,
};

#[cfg(not(windows))]
pub fn run_elevated_worker(_args: &[String]) -> i32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_frame_roundtrip_and_eof() {
        let mut buf = Vec::new();
        write_frame(&mut buf, FRAME_DATA, b"hello admin pty").unwrap();
        write_frame(&mut buf, FRAME_RESIZE, &[120, 0, 30, 0]).unwrap();
        write_frame(&mut buf, FRAME_CLOSE, &[]).unwrap();

        let mut cursor = Cursor::new(buf);
        assert_eq!(
            read_frame(&mut cursor).unwrap(),
            Some((FRAME_DATA, b"hello admin pty".to_vec()))
        );
        assert_eq!(
            read_frame(&mut cursor).unwrap(),
            Some((FRAME_RESIZE, vec![120, 0, 30, 0]))
        );
        assert_eq!(read_frame(&mut cursor).unwrap(), Some((FRAME_CLOSE, vec![])));
        assert_eq!(read_frame(&mut cursor).unwrap(), None);
    }

    #[cfg(windows)]
    #[test]
    fn test_quote_win32_arg_spaces_and_backslashes() {
        assert_eq!(win_impl::quote_win32_arg("simple"), "simple");
        assert_eq!(
            win_impl::quote_win32_arg(r"C:\Users\My Name\dir\"),
            r#""C:\Users\My Name\dir\\""#
        );
    }

    #[cfg(windows)]
    #[test]
    fn test_overlapped_named_pipe_connect_and_roundtrip() {
        use std::sync::Arc;
        use std::time::Duration;
        use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
        use windows_sys::Win32::Storage::FileSystem::{
            PIPE_ACCESS_INBOUND, PIPE_ACCESS_OUTBOUND,
        };

        let _ = crate::os::is_process_elevated();

        let id = format!("test_{}", std::process::id());
        let pipe_in_name = format!(r"\\.\pipe\coreterm_{id}_in");
        let pipe_out_name = format!(r"\\.\pipe\coreterm_{id}_out");

        let pipe_in_handle =
            win_impl::create_server_pipe(&pipe_in_name, PIPE_ACCESS_OUTBOUND).unwrap();
        let pipe_out_handle =
            win_impl::create_server_pipe(&pipe_out_name, PIPE_ACCESS_INBOUND).unwrap();

        let out_pending = win_impl::begin_overlapped_connect(pipe_out_handle.0).unwrap();
        let in_pending = win_impl::begin_overlapped_connect(pipe_in_handle.0).unwrap();

        let client_out_name = pipe_out_name.clone();
        let client_in_name = pipe_in_name.clone();
        let client = std::thread::spawn(move || {
            // Force ERROR_IO_PENDING overlapped kernel completion path after delay.
            std::thread::sleep(Duration::from_millis(40));
            let mut out_file =
                win_impl::open_client_pipe(&client_out_name, GENERIC_WRITE).unwrap();
            let mut in_file = win_impl::open_client_pipe(&client_in_name, GENERIC_READ).unwrap();

            write_frame(&mut out_file, FRAME_DATA, b"handshake-ok").unwrap();
            let incoming = read_frame(&mut in_file).unwrap();
            assert_eq!(incoming, Some((FRAME_DATA, b"ping".to_vec())));
            write_frame(&mut out_file, FRAME_EXIT, &[1, 0, 0, 0, 0]).unwrap();
        });

        win_impl::wait_connect_event(out_pending, None, 5_000).unwrap();
        win_impl::wait_connect_event(in_pending, None, 5_000).unwrap();

        let pipe_out = Arc::new(OverlappedPipe::from_handle(pipe_out_handle));
        let pipe_in = Arc::new(OverlappedPipe::from_handle(pipe_in_handle));
        let mut reader = PipeReader(pipe_out);
        let mut writer = PipeWriter(pipe_in);

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
