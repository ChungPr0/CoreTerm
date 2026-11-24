use std::io::{self, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use rand_core::{OsRng, RngCore};
use zeroize::Zeroizing;

use crate::core::error::{CoreError, CoreResult};
use crate::pty::expect::extract_algo_and_fingerprint;

pub const ASKPASS_FLAG: &str = "--coreterm-askpass";
pub const ENV_ASKPASS_MODE: &str = "CORETERM_ASKPASS_MODE";
pub const ENV_ASKPASS_PIPE: &str = "CORETERM_ASKPASS_PIPE";
pub const ENV_ASKPASS_TOKEN: &str = "CORETERM_ASKPASS_TOKEN";

#[cfg(windows)]
const ASKPASS_PIPE_PREFIX: &str = r"\\.\pipe\coreterm_askpass_";

const MAX_TOKEN_BYTES: usize = 256;
const MAX_PROMPT_BYTES: usize = 8192;
const MAX_SECRET_BYTES: usize = 16384;

const STATUS_DENY_OR_CANCEL: u8 = 0;
const STATUS_OK: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AskpassPromptKind {
    HostKeyConfirm {
        algorithm: String,
        fingerprint: String,
        reason: String,
    },
    Passphrase,
    Password,
    InteractiveChallenge,
}

#[derive(Debug, Clone)]
pub struct AskpassPolicyState {
    pub auth_method: String,
    pub host_pw_mode: String,
    pub password_attempts: u8,
    pub passphrase_attempts: u8,
}

#[derive(Debug)]
pub enum AskpassDecision {
    AutoFill(Zeroizing<String>),
    PromptUserSecret {
        prompt_type: &'static str,
        prompt_text: String,
        attempt: u8,
        is_reusable: bool,
        clear_cached_secret: bool,
    },
    PromptHostKey {
        algorithm: String,
        fingerprint: String,
        reason: String,
    },
}

fn extract_last_non_empty_line(text: &str) -> String {
    text.lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn is_ssh_passphrase_prompt(line: &str) -> bool {
    let lower = line.trim().to_ascii_lowercase();
    lower.starts_with("enter passphrase for key") && lower.ends_with(':')
}

fn is_ssh_password_prompt(line: &str) -> bool {
    let trimmed = line.trim();
    let lower = trimmed.to_lowercase();
    if !lower.ends_with(':') || lower.contains("[sudo]") {
        return false;
    }
    if lower.contains("'s password:") || lower.contains("’s password:") {
        return true;
    }
    if lower == "password:" || lower == "enter password:" {
        return true;
    }
    if lower.ends_with(") password:") {
        return true;
    }
    false
}

pub fn classify_askpass_prompt(prompt: &str) -> AskpassPromptKind {
    let lower = prompt.to_lowercase();
    if lower.contains("continue connecting (yes/no") {
        let (algorithm, fingerprint) = extract_algo_and_fingerprint(prompt);
        return AskpassPromptKind::HostKeyConfirm {
            algorithm,
            fingerprint,
            reason: "FIRST_TIME_CONNECT".to_string(),
        };
    }

    let last_line = extract_last_non_empty_line(prompt);
    if is_ssh_passphrase_prompt(&last_line) {
        return AskpassPromptKind::Passphrase;
    }
    if is_ssh_password_prompt(&last_line) {
        return AskpassPromptKind::Password;
    }
    AskpassPromptKind::InteractiveChallenge
}

pub fn decide_askpass_action<FPw, FSavedPw, FPass, FSavedPass>(
    state: &mut AskpassPolicyState,
    prompt: &str,
    lookup_tab_pw: FPw,
    lookup_saved_pw: FSavedPw,
    lookup_tab_pass: FPass,
    lookup_saved_pass: FSavedPass,
) -> AskpassDecision
where
    FPw: FnOnce() -> Option<Zeroizing<String>>,
    FSavedPw: FnOnce() -> Option<Zeroizing<String>>,
    FPass: FnOnce() -> Option<Zeroizing<String>>,
    FSavedPass: FnOnce() -> Option<Zeroizing<String>>,
{
    let prompt_text = extract_last_non_empty_line(prompt);
    match classify_askpass_prompt(prompt) {
        AskpassPromptKind::HostKeyConfirm {
            algorithm,
            fingerprint,
            reason,
        } => AskpassDecision::PromptHostKey {
            algorithm,
            fingerprint,
            reason,
        },
        AskpassPromptKind::Password => {
            state.password_attempts = state.password_attempts.saturating_add(1);
            let attempt = state.password_attempts;
            let clear_cached_secret = attempt > 1;
            if state.auth_method == "PASSWORD" && attempt == 1 {
                let secret = lookup_tab_pw().or_else(|| {
                    if state.host_pw_mode == "SAVED" {
                        lookup_saved_pw()
                    } else {
                        None
                    }
                });
                if let Some(secret) = secret {
                    return AskpassDecision::AutoFill(secret);
                }
            }
            AskpassDecision::PromptUserSecret {
                prompt_type: "PASSWORD",
                prompt_text,
                attempt,
                is_reusable: state.auth_method == "PASSWORD",
                clear_cached_secret,
            }
        }
        AskpassPromptKind::Passphrase => {
            state.passphrase_attempts = state.passphrase_attempts.saturating_add(1);
            let attempt = state.passphrase_attempts;
            let clear_cached_secret = attempt > 1;
            if state.auth_method == "SSH_KEY" && attempt == 1 {
                let secret = lookup_tab_pass().or_else(lookup_saved_pass);
                if let Some(secret) = secret {
                    return AskpassDecision::AutoFill(secret);
                }
            }
            AskpassDecision::PromptUserSecret {
                prompt_type: "KEY_PASSPHRASE",
                prompt_text,
                attempt,
                is_reusable: state.auth_method == "SSH_KEY",
                clear_cached_secret,
            }
        }
        AskpassPromptKind::InteractiveChallenge => AskpassDecision::PromptUserSecret {
            prompt_type: "PASSWORD",
            prompt_text: if prompt_text.is_empty() {
                prompt.trim().to_string()
            } else {
                prompt_text
            },
            attempt: 1,
            is_reusable: false,
            clear_cached_secret: false,
        },
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn hex_random(bytes_len: usize) -> Zeroizing<String> {
    let mut raw = Zeroizing::new(vec![0u8; bytes_len]);
    OsRng.fill_bytes(&mut raw);
    let mut out = Zeroizing::new(String::with_capacity(bytes_len * 2));
    for b in raw.iter() {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn write_lp_bytes<W: Write>(writer: &mut W, data: &[u8]) -> io::Result<()> {
    let len = u32::try_from(data.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Payload exceeds u32 max"))?;
    writer.write_all(&len.to_le_bytes())?;
    if !data.is_empty() {
        writer.write_all(data)?;
    }
    writer.flush()
}

fn read_lp_bytes<R: Read>(reader: &mut R, max_len: usize) -> io::Result<Zeroizing<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > max_len {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Askpass frame exceeds limit ({len} > {max_len})"),
        ));
    }
    let mut payload = Zeroizing::new(vec![0u8; len]);
    if len > 0 {
        reader.read_exact(&mut payload)?;
    }
    Ok(payload)
}

pub fn is_valid_askpass_pipe_name(pipe_name: &str) -> bool {
    #[cfg(windows)]
    {
        let Some(rest) = pipe_name.strip_prefix(ASKPASS_PIPE_PREFIX) else {
            return false;
        };
        !rest.is_empty()
            && rest.len() <= 64
            && rest
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_')
    }
    #[cfg(not(windows))]
    {
        !pipe_name.trim().is_empty() && !pipe_name.contains('\0')
    }
}

pub fn should_run_askpass_helper() -> bool {
    std::env::var_os(ENV_ASKPASS_MODE).is_some_and(|v| v == "1")
        && std::env::var_os(ENV_ASKPASS_PIPE).is_some()
        && std::env::var_os(ENV_ASKPASS_TOKEN).is_some()
}

fn extract_helper_prompt_from_args(args: &[String]) -> String {
    if args.first().map(String::as_str) == Some(ASKPASS_FLAG) {
        args.get(1).cloned().unwrap_or_default()
    } else {
        args.first().cloned().unwrap_or_default()
    }
}

pub fn run_askpass_helper() -> i32 {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let prompt = extract_helper_prompt_from_args(&args);

    let Ok(pipe_name) = std::env::var(ENV_ASKPASS_PIPE) else {
        return 1;
    };
    let Ok(raw_token) = std::env::var(ENV_ASKPASS_TOKEN) else {
        return 1;
    };
    let token = Zeroizing::new(raw_token);

    match request_askpass_secret(&pipe_name, &token, &prompt) {
        Ok(Some(secret)) => {
            let mut stdout = io::stdout().lock();
            if stdout.write_all(secret.as_bytes()).is_err()
                || stdout.write_all(b"\n").is_err()
                || stdout.flush().is_err()
            {
                return 1;
            }
            0
        }
        Ok(None) | Err(_) => 1,
    }
}

fn serve_single_stream<S, F>(stream: &mut S, expected_token: &str, handler: &mut F)
where
    S: Read + Write,
    F: FnMut(&str) -> Option<Zeroizing<String>>,
{
    let Ok(token_bytes) = read_lp_bytes(stream, MAX_TOKEN_BYTES) else {
        return;
    };
    let Ok(prompt_bytes) = read_lp_bytes(stream, MAX_PROMPT_BYTES) else {
        return;
    };

    if !constant_time_eq(&token_bytes, expected_token.as_bytes()) {
        let _ = stream.write_all(&[STATUS_DENY_OR_CANCEL]);
        let _ = stream.flush();
        return;
    }

    let prompt = String::from_utf8_lossy(&prompt_bytes).into_owned();
    match handler(&prompt) {
        Some(secret) => {
            if stream.write_all(&[STATUS_OK]).is_ok() {
                let _ = write_lp_bytes(stream, secret.as_bytes());
            }
        }
        None => {
            let _ = stream.write_all(&[STATUS_DENY_OR_CANCEL]);
            let _ = stream.flush();
        }
    }
}

fn exchange_client_stream<S>(
    stream: &mut S,
    token: &str,
    prompt: &str,
) -> io::Result<Option<Zeroizing<String>>>
where
    S: Read + Write,
{
    write_lp_bytes(stream, token.as_bytes())?;
    write_lp_bytes(stream, prompt.as_bytes())?;

    let mut status = [0u8; 1];
    stream.read_exact(&mut status)?;
    if status[0] != STATUS_OK {
        return Ok(None);
    }

    let mut secret_bytes = read_lp_bytes(stream, MAX_SECRET_BYTES)?;
    let raw = std::mem::take(&mut *secret_bytes);
    let secret_str = String::from_utf8(raw).map_err(|e| {
        let _zeroize_on_drop = Zeroizing::new(e.into_bytes());
        io::Error::new(io::ErrorKind::InvalidData, "Non-UTF-8 askpass secret")
    })?;
    Ok(Some(Zeroizing::new(secret_str)))
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::fs::File;
    use std::os::windows::io::FromRawHandle;

    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, LocalFree, ERROR_BROKEN_PIPE, ERROR_IO_PENDING, ERROR_NO_DATA,
        ERROR_PIPE_BUSY, ERROR_PIPE_CONNECTED, GENERIC_READ, GENERIC_WRITE, HANDLE, HLOCAL,
        INVALID_HANDLE_VALUE, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, ReadFile, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_FLAG_FIRST_PIPE_INSTANCE,
        FILE_FLAG_OVERLAPPED, OPEN_EXISTING, PIPE_ACCESS_DUPLEX, SECURITY_ANONYMOUS,
        SECURITY_SQOS_PRESENT,
    };
    use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
    use windows_sys::Win32::System::Pipes::{
        ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, PIPE_READMODE_BYTE,
        PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
    };
    use windows_sys::Win32::System::Threading::{
        CreateEventW, ResetEvent, SetEvent, WaitForMultipleObjects, INFINITE,
    };

    const SDDL_REVISION_1: u32 = 1;

    struct OwnedHandle(HANDLE);
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

    fn to_wide(s: &str) -> Vec<u16> {
        let mut v: Vec<u16> = s.encode_utf16().collect();
        v.push(0);
        v
    }

    fn create_askpass_pipe(name: &str) -> Result<OwnedHandle, String> {
        let wide_name = to_wide(name);
        // Restrict askpass pipe strictly to Owner (current user) only.
        let sddl = to_wide("D:(A;;GA;;;OW)");
        let mut sd: *mut core::ffi::c_void = std::ptr::null_mut();

        unsafe {
            let sd_ok = ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut sd,
                std::ptr::null_mut(),
            );
            if sd_ok == 0 || sd.is_null() {
                return Err(format!(
                    "Failed to construct askpass security descriptor: {}",
                    io::Error::last_os_error()
                ));
            }

            let sa = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: sd,
                bInheritHandle: 0,
            };

            let handle = CreateNamedPipeW(
                wide_name.as_ptr(),
                PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                1,
                16384,
                16384,
                0,
                &sa,
            );
            let _ = LocalFree(sd as HLOCAL);

            if handle.is_null() || handle == INVALID_HANDLE_VALUE {
                return Err(format!(
                    "CreateNamedPipeW failed for askpass pipe: {}",
                    io::Error::last_os_error()
                ));
            }
            Ok(OwnedHandle(handle))
        }
    }

    struct OverlappedPipeStream {
        handle: HANDLE,
    }

    impl Read for OverlappedPipeStream {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            unsafe {
                let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
                if event.is_null() {
                    return Err(io::Error::last_os_error());
                }
                let _ev = OwnedHandle(event);

                let mut ov: Box<OVERLAPPED> = Box::new(std::mem::zeroed());
                ov.hEvent = event;
                let mut read_bytes = 0u32;
                let ok = ReadFile(
                    self.handle,
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
                    let res = GetOverlappedResult(self.handle, &*ov, &mut read_bytes, 1);
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
    }

    impl Write for OverlappedPipeStream {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            unsafe {
                let event = CreateEventW(std::ptr::null(), 1, 0, std::ptr::null());
                if event.is_null() {
                    return Err(io::Error::last_os_error());
                }
                let _ev = OwnedHandle(event);

                let mut ov: Box<OVERLAPPED> = Box::new(std::mem::zeroed());
                ov.hEvent = event;
                let mut written = 0u32;
                let ok = WriteFile(
                    self.handle,
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
                    let res = GetOverlappedResult(self.handle, &*ov, &mut written, 1);
                    if res == 0 {
                        return Err(io::Error::from_raw_os_error(GetLastError() as i32));
                    }
                }
                Ok(written as usize)
            }
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    pub struct AskpassServerHandle {
        pipe_name: String,
        token: Zeroizing<String>,
        shutdown_flag: Arc<AtomicBool>,
        shutdown_event: Arc<OwnedHandle>,
    }

    impl AskpassServerHandle {
        pub fn pipe_name(&self) -> &str {
            &self.pipe_name
        }

        pub fn token(&self) -> &str {
            &self.token
        }

        pub fn ssh_env_vars(&self) -> CoreResult<Vec<(String, Zeroizing<String>)>> {
            let exe = std::env::current_exe()
                .map_err(|e| CoreError::Pty(format!("Failed to resolve CoreTerm executable: {e}")))?;
            Ok(vec![
                (
                    "SSH_ASKPASS".to_string(),
                    Zeroizing::new(exe.to_string_lossy().into_owned()),
                ),
                (
                    "SSH_ASKPASS_REQUIRE".to_string(),
                    Zeroizing::new("force".to_string()),
                ),
                (
                    "DISPLAY".to_string(),
                    Zeroizing::new("coreterm:0".to_string()),
                ),
                (ENV_ASKPASS_MODE.to_string(), Zeroizing::new("1".to_string())),
                (
                    ENV_ASKPASS_PIPE.to_string(),
                    Zeroizing::new(self.pipe_name.clone()),
                ),
                (ENV_ASKPASS_TOKEN.to_string(), self.token.clone()),
            ])
        }

        pub fn shutdown(&self) {
            self.shutdown_flag.store(true, Ordering::SeqCst);
            unsafe {
                let _ = SetEvent(self.shutdown_event.0);
            }
        }
    }

    impl Drop for AskpassServerHandle {
        fn drop(&mut self) {
            self.shutdown();
        }
    }

    pub fn spawn_askpass_server<F>(mut handler: F) -> CoreResult<AskpassServerHandle>
    where
        F: FnMut(&str) -> Option<Zeroizing<String>> + Send + 'static,
    {
        let id = hex_random(12);
        let pipe_name = format!("{ASKPASS_PIPE_PREFIX}{}", id.as_str());
        let token = hex_random(32);

        let pipe = create_askpass_pipe(&pipe_name).map_err(CoreError::Pty)?;
        let shutdown_ev_raw = unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
        if shutdown_ev_raw.is_null() {
            return Err(CoreError::Pty(format!(
                "Failed to create askpass shutdown event: {}",
                io::Error::last_os_error()
            )));
        }
        let shutdown_event = Arc::new(OwnedHandle(shutdown_ev_raw));
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let thread_shutdown_flag = Arc::clone(&shutdown_flag);
        let thread_shutdown_ev = Arc::clone(&shutdown_event);
        let thread_token = token.clone();

        std::thread::Builder::new()
            .name(format!("ssh-askpass-{}", &id.as_str()[..8]))
            .spawn(move || {
                let pipe = pipe;
                let connect_ev_raw =
                    unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
                if connect_ev_raw.is_null() {
                    return;
                }
                let connect_ev = OwnedHandle(connect_ev_raw);

                while !thread_shutdown_flag.load(Ordering::SeqCst) {
                    let connected = unsafe {
                        let _ = ResetEvent(connect_ev.0);
                        let mut ov: Box<OVERLAPPED> = Box::new(std::mem::zeroed());
                        ov.hEvent = connect_ev.0;
                        let ok = ConnectNamedPipe(pipe.0, &mut *ov);
                        if ok != 0 {
                            true
                        } else {
                            let err = GetLastError();
                            if err == ERROR_PIPE_CONNECTED {
                                true
                            } else if err == ERROR_IO_PENDING {
                                let handles = [connect_ev.0, thread_shutdown_ev.0];
                                let wait =
                                    WaitForMultipleObjects(2, handles.as_ptr(), 0, INFINITE);
                                if wait == WAIT_OBJECT_0 {
                                    let mut bytes = 0u32;
                                    GetOverlappedResult(pipe.0, &*ov, &mut bytes, 1) != 0
                                } else {
                                    let _ = CancelIoEx(pipe.0, &*ov);
                                    let mut dummy = 0u32;
                                    let _ = GetOverlappedResult(pipe.0, &*ov, &mut dummy, 1);
                                    false
                                }
                            } else {
                                false
                            }
                        }
                    };

                    if !connected || thread_shutdown_flag.load(Ordering::SeqCst) {
                        unsafe {
                            let _ = DisconnectNamedPipe(pipe.0);
                        }
                        break;
                    }

                    let mut stream = OverlappedPipeStream { handle: pipe.0 };
                    serve_single_stream(&mut stream, &thread_token, &mut handler);

                    unsafe {
                        let _ = DisconnectNamedPipe(pipe.0);
                    }
                }
            })
            .map_err(|e| CoreError::Pty(format!("Failed to spawn askpass server thread: {e}")))?;

        Ok(AskpassServerHandle {
            pipe_name,
            token,
            shutdown_flag,
            shutdown_event,
        })
    }

    pub fn request_askpass_secret(
        pipe_name: &str,
        token: &str,
        prompt: &str,
    ) -> Result<Option<Zeroizing<String>>, String> {
        if !is_valid_askpass_pipe_name(pipe_name) {
            return Err("Invalid askpass pipe name".to_string());
        }
        let wide = to_wide(pipe_name);
        let mut file_opt = None;
        for attempt in 0..10 {
            unsafe {
                let handle = CreateFileW(
                    wide.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL | SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS,
                    std::ptr::null_mut(),
                );
                if !handle.is_null() && handle != INVALID_HANDLE_VALUE {
                    file_opt = Some(File::from_raw_handle(handle as _));
                    break;
                }
                let err = io::Error::last_os_error();
                if err.raw_os_error() == Some(ERROR_PIPE_BUSY as i32) && attempt < 9 {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    continue;
                }
                return Err(format!("Failed to connect to askpass pipe: {err}"));
            }
        }
        let mut file = file_opt.ok_or_else(|| "Askpass pipe busy".to_string())?;
        exchange_client_stream(&mut file, token, prompt)
            .map_err(|e| format!("Askpass IPC error: {e}"))
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::PathBuf;

    pub struct AskpassServerHandle {
        socket_path: PathBuf,
        token: Zeroizing<String>,
        shutdown_flag: Arc<AtomicBool>,
    }

    impl AskpassServerHandle {
        pub fn pipe_name(&self) -> &str {
            self.socket_path.to_str().unwrap_or("")
        }

        pub fn token(&self) -> &str {
            &self.token
        }

        pub fn ssh_env_vars(&self) -> CoreResult<Vec<(String, Zeroizing<String>)>> {
            let exe = std::env::current_exe()
                .map_err(|e| CoreError::Pty(format!("Failed to resolve CoreTerm executable: {e}")))?;
            Ok(vec![
                (
                    "SSH_ASKPASS".to_string(),
                    Zeroizing::new(exe.to_string_lossy().into_owned()),
                ),
                (
                    "SSH_ASKPASS_REQUIRE".to_string(),
                    Zeroizing::new("force".to_string()),
                ),
                (
                    "DISPLAY".to_string(),
                    Zeroizing::new("coreterm:0".to_string()),
                ),
                (ENV_ASKPASS_MODE.to_string(), Zeroizing::new("1".to_string())),
                (
                    ENV_ASKPASS_PIPE.to_string(),
                    Zeroizing::new(self.socket_path.to_string_lossy().into_owned()),
                ),
                (ENV_ASKPASS_TOKEN.to_string(), self.token.clone()),
            ])
        }

        pub fn shutdown(&self) {
            self.shutdown_flag.store(true, Ordering::SeqCst);
            let _ = UnixStream::connect(&self.socket_path);
            let _ = std::fs::remove_file(&self.socket_path);
        }
    }

    impl Drop for AskpassServerHandle {
        fn drop(&mut self) {
            self.shutdown();
        }
    }

    pub fn spawn_askpass_server<F>(mut handler: F) -> CoreResult<AskpassServerHandle>
    where
        F: FnMut(&str) -> Option<Zeroizing<String>> + Send + 'static,
    {
        let id = hex_random(12);
        let socket_path = std::env::temp_dir().join(format!("coreterm_askpass_{}.sock", id.as_str()));
        let _ = std::fs::remove_file(&socket_path);
        let listener = UnixListener::bind(&socket_path)
            .map_err(|e| CoreError::Pty(format!("Failed to bind askpass socket: {e}")))?;
        let _ = std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600));

        let token = hex_random(32);
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let thread_shutdown = Arc::clone(&shutdown_flag);
        let thread_token = token.clone();
        let thread_path = socket_path.clone();

        std::thread::Builder::new()
            .name(format!("ssh-askpass-{}", &id.as_str()[..8]))
            .spawn(move || {
                for incoming in listener.incoming() {
                    if thread_shutdown.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(mut stream) = incoming {
                        serve_single_stream(&mut stream, &thread_token, &mut handler);
                    }
                }
                let _ = std::fs::remove_file(&thread_path);
            })
            .map_err(|e| CoreError::Pty(format!("Failed to spawn askpass server thread: {e}")))?;

        Ok(AskpassServerHandle {
            socket_path,
            token,
            shutdown_flag,
        })
    }

    pub fn request_askpass_secret(
        pipe_name: &str,
        token: &str,
        prompt: &str,
    ) -> Result<Option<Zeroizing<String>>, String> {
        if !is_valid_askpass_pipe_name(pipe_name) {
            return Err("Invalid askpass socket path".to_string());
        }
        let mut stream = UnixStream::connect(pipe_name)
            .map_err(|e| format!("Failed to connect to askpass socket: {e}"))?;
        exchange_client_stream(&mut stream, token, prompt)
            .map_err(|e| format!("Askpass IPC error: {e}"))
    }
}

pub use platform::{request_askpass_secret, spawn_askpass_server, AskpassServerHandle};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_host_key_passphrase_password_and_2fa_prompts() {
        assert_eq!(
            classify_askpass_prompt(
                "The authenticity of host '10.0.0.1' can't be established.\nED25519 key fingerprint is SHA256:xyz.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? "
            ),
            AskpassPromptKind::HostKeyConfirm {
                algorithm: "ED25519".to_string(),
                fingerprint: "SHA256:xyz".to_string(),
                reason: "FIRST_TIME_CONNECT".to_string(),
            }
        );
        assert_eq!(
            classify_askpass_prompt("Enter passphrase for key '/home/dev/.ssh/id_ed25519': "),
            AskpassPromptKind::Passphrase
        );
        assert_eq!(
            classify_askpass_prompt("deploy@10.0.0.2's password: "),
            AskpassPromptKind::Password
        );
        assert_eq!(
            classify_askpass_prompt("Verification code: "),
            AskpassPromptKind::InteractiveChallenge
        );
        assert_eq!(
            classify_askpass_prompt("One-time password (OATH) for deploy: "),
            AskpassPromptKind::InteractiveChallenge
        );
    }

    #[test]
    fn policy_auto_fills_only_matching_auth_mode_once_and_never_autofills_2fa() {
        let mut pw_state = AskpassPolicyState {
            auth_method: "PASSWORD".to_string(),
            host_pw_mode: "SAVED".to_string(),
            password_attempts: 0,
            passphrase_attempts: 0,
        };

        let d1 = decide_askpass_action(
            &mut pw_state,
            "deploy@10.0.0.1's password: ",
            || None,
            || Some(Zeroizing::new("s3cr3t".to_string())),
            || Some(Zeroizing::new("key-pass".to_string())),
            || Some(Zeroizing::new("key-pass".to_string())),
        );
        assert!(matches!(d1, AskpassDecision::AutoFill(ref s) if s.as_str() == "s3cr3t"));

        let d2 = decide_askpass_action(
            &mut pw_state,
            "deploy@10.0.0.1's password: ",
            || Some(Zeroizing::new("stale".to_string())),
            || Some(Zeroizing::new("s3cr3t".to_string())),
            || None,
            || None,
        );
        assert!(matches!(
            d2,
            AskpassDecision::PromptUserSecret {
                prompt_type: "PASSWORD",
                attempt: 2,
                is_reusable: true,
                clear_cached_secret: true,
                ..
            }
        ));

        let d3 = decide_askpass_action(
            &mut pw_state,
            "Enter passphrase for key '/id_ed25519': ",
            || Some(Zeroizing::new("s3cr3t".to_string())),
            || Some(Zeroizing::new("s3cr3t".to_string())),
            || Some(Zeroizing::new("key-pass".to_string())),
            || Some(Zeroizing::new("key-pass".to_string())),
        );
        assert!(matches!(
            d3,
            AskpassDecision::PromptUserSecret {
                prompt_type: "KEY_PASSPHRASE",
                is_reusable: false,
                ..
            }
        ));

        let d4 = decide_askpass_action(
            &mut pw_state,
            "Verification code: ",
            || Some(Zeroizing::new("s3cr3t".to_string())),
            || Some(Zeroizing::new("s3cr3t".to_string())),
            || None,
            || None,
        );
        assert!(matches!(
            d4,
            AskpassDecision::PromptUserSecret {
                prompt_type: "PASSWORD",
                is_reusable: false,
                ..
            }
        ));
    }

    #[test]
    fn askpass_channel_authenticates_token_and_roundtrips_secret() {
        let server = spawn_askpass_server(|prompt| {
            if prompt.contains("password:") {
                Some(Zeroizing::new("vault-pw-123".to_string()))
            } else {
                None
            }
        })
        .expect("start askpass server");

        let pipe = server.pipe_name().to_string();
        let token = server.token().to_string();

        let bad_res = request_askpass_secret(&pipe, "wrong-token", "user@host's password:")
            .expect("ipc completes");
        assert!(bad_res.is_none());

        let ok_res = request_askpass_secret(&pipe, &token, "user@host's password:")
            .expect("ipc completes");
        assert_eq!(ok_res.as_deref().map(String::as_str), Some("vault-pw-123"));

        let cancel_res =
            request_askpass_secret(&pipe, &token, "Verification code:").expect("ipc completes");
        assert!(cancel_res.is_none());

        server.shutdown();
    }

    #[test]
    fn validates_askpass_pipe_names_and_helper_args() {
        #[cfg(windows)]
        {
            assert!(is_valid_askpass_pipe_name(
                r"\\.\pipe\coreterm_askpass_abcdef012345"
            ));
            assert!(!is_valid_askpass_pipe_name(
                r"\\evil\pipe\coreterm_askpass_abcdef"
            ));
            assert!(!is_valid_askpass_pipe_name(r"\\.\pipe\coreterm_other"));
            assert!(!is_valid_askpass_pipe_name(
                r"\\.\pipe\coreterm_askpass_../evil"
            ));
        }

        assert_eq!(
            extract_helper_prompt_from_args(&[
                ASKPASS_FLAG.to_string(),
                "user@host's password: ".to_string()
            ]),
            "user@host's password: "
        );
        assert_eq!(
            extract_helper_prompt_from_args(&["Enter passphrase for key: ".to_string()]),
            "Enter passphrase for key: "
        );
    }
}
