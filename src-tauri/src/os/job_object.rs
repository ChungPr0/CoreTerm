use std::sync::Arc;
use tracing::{info, warn};

use crate::ipc::error::{AppError, AppResult};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
    },
};

struct JobHandleInner {
    #[cfg(windows)]
    handle: HANDLE,
}

unsafe impl Send for JobHandleInner {}
unsafe impl Sync for JobHandleInner {}

impl Drop for JobHandleInner {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            if !self.handle.is_null() {
                let _ = CloseHandle(self.handle);
                info!("Windows Job Object handle closed.");
            }
        }
    }
}

#[derive(Clone)]
pub struct JobObjectSupervisor {
    inner: Arc<JobHandleInner>,
}

impl JobObjectSupervisor {
    /// Creates a Windows Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE to prevent orphan ssh.exe processes.
    pub fn new() -> AppResult<Self> {
        #[cfg(windows)]
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(AppError::Os(
                    "CreateJobObjectW failed to create Windows Job Object".to_string(),
                ));
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let ok = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if ok == 0 {
                let _ = CloseHandle(handle);
                return Err(AppError::Os(
                    "SetInformationJobObject(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) failed".to_string(),
                ));
            }

            Ok(Self {
                inner: Arc::new(JobHandleInner { handle }),
            })
        }

        #[cfg(not(windows))]
        {
            Ok(Self {
                inner: Arc::new(JobHandleInner {}),
            })
        }
    }

    pub fn assign_pid(&self, pid: u32) -> AppResult<()> {
        #[cfg(windows)]
        unsafe {
            let process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process_handle.is_null() {
                return Err(AppError::Os(format!(
                    "OpenProcess failed for child PID {pid}"
                )));
            }

            let assigned = AssignProcessToJobObject(self.inner.handle, process_handle);
            let _ = CloseHandle(process_handle);

            if assigned == 0 {
                warn!("AssignProcessToJobObject returned 0 for PID {pid}");
            }
            Ok(())
        }

        #[cfg(not(windows))]
        {
            let _ = pid;
            Ok(())
        }
    }
}
