#[cfg(windows)]
mod win_worker {
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};

    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
    };

    use crate::infra::os::elevated_pty::pipe::{open_client_pipe, OwnedHandle};
    use crate::infra::os::elevated_pty::protocol::{
        read_frame, write_frame, FRAME_CLOSE, FRAME_DATA, FRAME_ERROR, FRAME_EXIT, FRAME_RESIZE,
    };
    use crate::infra::os::job_object::JobObjectSupervisor;

    #[derive(Default)]
    struct WorkerPtyHandles {
        child: Option<Box<dyn portable_pty::Child + Send + Sync>>,
        master: Option<Box<dyn portable_pty::MasterPty + Send>>,
        job: Option<JobObjectSupervisor>,
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
        // Drop MasterPty & JobObject outside the lock to avoid blocking control threads.
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
                _ => i += 1,
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

        let pair = match native_pty_system().openpty(PtySize {
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

        let job = JobObjectSupervisor::new().ok();
        if let (Some(ref j), Some(pid)) = (&job, child.process_id()) {
            let _ = j.assign_pid(pid);
        }

        if let Ok(mut guard) = handles.lock() {
            guard.child = Some(child);
            guard.master = Some(pair.master);
            guard.job = job;
        }

        let handles_ctrl = handles.clone();
        std::thread::spawn(move || loop {
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
pub use win_worker::run_elevated_worker;

#[cfg(not(windows))]
pub fn run_elevated_worker(_args: &[String]) -> i32 {
    1
}
