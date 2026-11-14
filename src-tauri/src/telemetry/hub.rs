use std::collections::HashSet;
use std::ffi::OsString;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

use crate::db::Database;
use crate::ipc::dto::{TelemetryMetricsEventDto, HostFullConfigDto};
use crate::os::JobObjectSupervisor;
use crate::telemetry::parser::{
    compute_cpu_delta, parse_proc_meminfo, parse_proc_stat, CpuJiffies, MemStats,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SAMPLE_TIMEOUT_MS: u64 = 1500;
const DELIMITER: &str = "---MEMINFO---";

struct WorkerEntry {
    subscribers: HashSet<String>,
    stop_tx: Option<watch::Sender<bool>>,
}

/// Multiplexes background No-PTY SSH telemetry workers per `host_id` using reference counting.
#[derive(Clone)]
pub struct TelemetryHub {
    workers: Arc<DashMap<String, Mutex<WorkerEntry>>>,
    tab_to_host: Arc<DashMap<String, String>>,
    job_supervisor: JobObjectSupervisor,
    local_enabled: Arc<AtomicBool>,
    local_interval_sec: Arc<AtomicU64>,
}

impl TelemetryHub {
    pub fn new(job_supervisor: JobObjectSupervisor) -> Self {
        Self {
            workers: Arc::new(DashMap::new()),
            tab_to_host: Arc::new(DashMap::new()),
            job_supervisor,
            local_enabled: Arc::new(AtomicBool::new(false)),
            local_interval_sec: Arc::new(AtomicU64::new(2)),
        }
    }

    pub fn set_local_config(&self, enabled: bool, interval_sec: u16) {
        self.local_enabled.store(enabled, Ordering::Relaxed);
        self.local_interval_sec
            .store(u64::from(interval_sec.clamp(1, 60)), Ordering::Relaxed);
    }

    /// Increments subscriber count for `host_id`; returns `(new_ref_count, is_first_subscriber)`.
    pub fn acquire_ref(&self, host_id: &str, tab_id: &str) -> (usize, bool) {
        self.tab_to_host
            .insert(tab_id.to_string(), host_id.to_string());

        let entry = self
            .workers
            .entry(host_id.to_string())
            .or_insert_with(|| {
                Mutex::new(WorkerEntry {
                    subscribers: HashSet::new(),
                    stop_tx: None,
                })
            });

        let mut guard = entry.lock().unwrap();
        let was_empty = guard.subscribers.is_empty();
        guard.subscribers.insert(tab_id.to_string());
        (guard.subscribers.len(), was_empty)
    }

    /// Decrements subscriber count for `tab_id`; stops and removes worker when count reaches 0.
    pub fn release_tab(&self, tab_id: &str) -> usize {
        let Some((_, host_id)) = self.tab_to_host.remove(tab_id) else {
            return 0;
        };

        let mut should_remove = false;
        let mut remaining = 0;

        if let Some(entry) = self.workers.get(&host_id) {
            let mut guard = entry.lock().unwrap();
            guard.subscribers.remove(tab_id);
            remaining = guard.subscribers.len();
            if remaining == 0 {
                if let Some(tx) = guard.stop_tx.take() {
                    let _ = tx.send(true);
                }
                should_remove = true;
            }
        }

        if should_remove {
            self.workers.remove(&host_id);
        }

        remaining
    }

    pub fn active_ref_count(&self, host_id: &str) -> usize {
        self.workers
            .get(host_id)
            .map(|e| e.lock().unwrap().subscribers.len())
            .unwrap_or(0)
    }

    pub fn register_tab(&self, app: &AppHandle, db: &Database, host_id: &str, tab_id: &str) {
        if host_id == "local" {
            if !self.local_enabled.load(Ordering::Relaxed) {
                return;
            }
        } else {
            let Ok(config) = db.host_get_detail(host_id) else {
                return;
            };
            if !config.options.telemetry_enabled {
                return;
            }
        }

        let (_, is_first) = self.acquire_ref(host_id, tab_id);
        if !is_first {
            return;
        }

        let (stop_tx, stop_rx) = watch::channel(false);
        if let Some(entry) = self.workers.get(host_id) {
            entry.lock().unwrap().stop_tx = Some(stop_tx);
        }

        let app_handle = app.clone();
        if host_id == "local" {
            let local_enabled = self.local_enabled.clone();
            let local_interval_sec = self.local_interval_sec.clone();
            tauri::async_runtime::spawn(async move {
                Self::run_local_worker_loop(app_handle, stop_rx, local_enabled, local_interval_sec).await;
            });
            return;
        }

        let db_clone = db.clone();
        let job_sup = self.job_supervisor.clone();
        let worker_host_id = host_id.to_string();

        tauri::async_runtime::spawn(async move {
            Self::run_worker_loop(app_handle, db_clone, job_sup, worker_host_id, stop_rx).await;
        });
    }

    pub fn shutdown_all(&self) {
        let tab_ids: Vec<String> = self.tab_to_host.iter().map(|e| e.key().clone()).collect();
        for tab_id in tab_ids {
            self.release_tab(&tab_id);
        }
    }

    async fn run_worker_loop(
        app: AppHandle,
        db: Database,
        job_supervisor: JobObjectSupervisor,
        host_id: String,
        mut stop_rx: watch::Receiver<bool>,
    ) {
        let mut prev_cpu: Option<CpuJiffies> = None;
        let mut last_mem: Option<MemStats> = None;
        let mut consecutive_failures: u32 = 0;

        loop {
            if *stop_rx.borrow() {
                break;
            }

            let Ok(config) = db.host_get_detail(&host_id) else {
                break;
            };
            if !config.options.telemetry_enabled {
                break;
            }

            let base_interval = config.options.telemetry_interval_sec.clamp(1, 60) as u64;

            match Self::sample_once(&config, &job_supervisor).await {
                Ok(Some((cpu_jiffies, mem_stats))) => {
                    consecutive_failures = 0;
                    let cpu_pct = match prev_cpu {
                        Some(ref prev) => compute_cpu_delta(prev, &cpu_jiffies),
                        None => 0.0,
                    };
                    prev_cpu = Some(cpu_jiffies);
                    last_mem = Some(mem_stats.clone());

                    let payload = TelemetryMetricsEventDto {
                        host_id: host_id.clone(),
                        cpu_usage_percent: cpu_pct,
                        ram_used_mb: mem_stats.ram_used_mb,
                        ram_total_mb: mem_stats.ram_total_mb,
                        ram_usage_percent: mem_stats.ram_usage_percent,
                        swap_used_mb: mem_stats.swap_used_mb,
                        swap_total_mb: mem_stats.swap_total_mb,
                        is_stale: false,
                        sampled_at_ms: now_ms(),
                    };
                    let _ = app.emit("telemetry:metrics", payload);
                }
                Ok(None) => {
                    // Remote target does not expose /proc/stat or /proc/meminfo; stop worker cleanly
                    break;
                }
                Err(_) => {
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    if let Some(ref mem) = last_mem {
                        let payload = TelemetryMetricsEventDto {
                            host_id: host_id.clone(),
                            cpu_usage_percent: 0.0,
                            ram_used_mb: mem.ram_used_mb,
                            ram_total_mb: mem.ram_total_mb,
                            ram_usage_percent: mem.ram_usage_percent,
                            swap_used_mb: mem.swap_used_mb,
                            swap_total_mb: mem.swap_total_mb,
                            is_stale: true,
                            sampled_at_ms: now_ms(),
                        };
                        let _ = app.emit("telemetry:metrics", payload);
                    }
                }
            }

            // Adaptive polling backoff on high latency or transient failures
            let sleep_secs = if consecutive_failures == 0 {
                base_interval
            } else if consecutive_failures < 3 {
                (base_interval * 2).min(10)
            } else {
                10
            };

            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(sleep_secs)) => {}
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() {
                        break;
                    }
                }
            }
        }
    }

    async fn sample_once(
        config: &HostFullConfigDto,
        job_supervisor: &JobObjectSupervisor,
    ) -> Result<Option<(CpuJiffies, MemStats)>, String> {
        let mut args: Vec<OsString> = Vec::with_capacity(18);
        args.push(OsString::from("-T"));
        args.push(OsString::from("-p"));
        args.push(OsString::from(config.port.to_string()));
        args.push(OsString::from("-l"));
        args.push(OsString::from(config.username.trim()));
        args.push(OsString::from("-o"));
        args.push(OsString::from("BatchMode=yes"));
        args.push(OsString::from("-o"));
        args.push(OsString::from("ConnectTimeout=2"));

        if config.auth_method == "SSH_KEY" {
            if let Some(ref key_path) = config.private_key_path {
                if !key_path.trim().is_empty() {
                    args.push(OsString::from("-i"));
                    args.push(OsString::from(key_path.trim()));
                    args.push(OsString::from("-o"));
                    args.push(OsString::from("IdentitiesOnly=yes"));
                }
            }
        }

        let strict_val = match config.options.strict_host_key_checking.as_str() {
            "YES" => "yes",
            "NO" => "no",
            _ => "accept-new",
        };
        args.push(OsString::from("-o"));
        args.push(OsString::from(format!(
            "StrictHostKeyChecking={strict_val}"
        )));

        args.push(OsString::from(config.host.trim()));
        args.push(OsString::from(format!(
            "cat /proc/stat; echo '{DELIMITER}'; cat /proc/meminfo"
        )));

        let mut cmd = tokio::process::Command::new("ssh.exe");
        cmd.args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let child = cmd.spawn().map_err(|e| e.to_string())?;
        if let Some(pid) = child.id() {
            let _ = job_supervisor.assign_pid(pid);
        }

        let output = tokio::time::timeout(
            Duration::from_millis(SAMPLE_TIMEOUT_MS),
            child.wait_with_output(),
        )
        .await
        .map_err(|_| "Telemetry sample timed out".to_string())?
        .map_err(|e| e.to_string())?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("No such file or directory") {
                return Ok(None);
            }
            return Err(format!("Exit status: {}", output.status));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let Some((stat_part, mem_part)) = stdout.split_once(DELIMITER) else {
            return Ok(None);
        };

        let Some(cpu) = parse_proc_stat(stat_part) else {
            return Ok(None);
        };
        let Some(mem) = parse_proc_meminfo(mem_part) else {
            return Ok(None);
        };

        Ok(Some((cpu, mem)))
    }

    async fn run_local_worker_loop(
        app: AppHandle,
        mut stop_rx: watch::Receiver<bool>,
        local_enabled: Arc<AtomicBool>,
        local_interval_sec: Arc<AtomicU64>,
    ) {
        let mut prev_cpu: Option<CpuJiffies> = sample_local_cpu();

        loop {
            if *stop_rx.borrow() || !local_enabled.load(Ordering::Relaxed) {
                break;
            }

            if let (Some(curr_cpu), Some(mem)) = (sample_local_cpu(), sample_local_mem()) {
                let cpu_pct = match prev_cpu {
                    Some(ref prev) => compute_cpu_delta(prev, &curr_cpu),
                    None => 0.0,
                };
                prev_cpu = Some(curr_cpu);

                let payload = TelemetryMetricsEventDto {
                    host_id: "local".to_string(),
                    cpu_usage_percent: cpu_pct,
                    ram_used_mb: mem.ram_used_mb,
                    ram_total_mb: mem.ram_total_mb,
                    ram_usage_percent: mem.ram_usage_percent,
                    swap_used_mb: 0,
                    swap_total_mb: 0,
                    is_stale: false,
                    sampled_at_ms: now_ms(),
                };
                let _ = app.emit("telemetry:metrics", payload);
            }

            let sleep_secs = local_interval_sec.load(Ordering::Relaxed).clamp(1, 60);
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(sleep_secs)) => {}
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() {
                        break;
                    }
                }
            }
        }
    }
}

#[cfg(windows)]
#[repr(C)]
struct MemoryStatusEx {
    dw_length: u32,
    dw_memory_load: u32,
    ull_total_phys: u64,
    ull_avail_phys: u64,
    ull_total_page_file: u64,
    ull_avail_page_file: u64,
    ull_total_virtual: u64,
    ull_avail_virtual: u64,
    ull_avail_extended_virtual: u64,
}

#[cfg(windows)]
extern "system" {
    fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
    fn GetSystemTimes(
        lp_idle_time: *mut u64,
        lp_kernel_time: *mut u64,
        lp_user_time: *mut u64,
    ) -> i32;
}

fn sample_local_cpu() -> Option<CpuJiffies> {
    #[cfg(windows)]
    unsafe {
        let mut idle: u64 = 0;
        let mut kernel: u64 = 0;
        let mut user: u64 = 0;
        if GetSystemTimes(&mut idle, &mut kernel, &mut user) != 0 {
            return Some(CpuJiffies {
                total: kernel.saturating_add(user),
                idle,
            });
        }
    }
    None
}

fn sample_local_mem() -> Option<MemStats> {
    #[cfg(windows)]
    unsafe {
        let mut status: MemoryStatusEx = std::mem::zeroed();
        status.dw_length = std::mem::size_of::<MemoryStatusEx>() as u32;
        if GlobalMemoryStatusEx(&mut status) != 0 && status.ull_total_phys > 0 {
            let total_mb = status.ull_total_phys / (1024 * 1024);
            let avail_mb = status.ull_avail_phys / (1024 * 1024);
            let used_mb = total_mb.saturating_sub(avail_mb);
            return Some(MemStats {
                ram_used_mb: used_mb,
                ram_total_mb: total_mb,
                ram_usage_percent: (status.dw_memory_load as f32).clamp(0.0, 100.0),
                swap_used_mb: 0,
                swap_total_mb: 0,
            });
        }
    }
    None
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_telemetry_hub_reference_counting() {
        let job = JobObjectSupervisor::new().expect("init job object");
        let hub = TelemetryHub::new(job);

        let (count1, first1) = hub.acquire_ref("host-alpha", "tab-1");
        assert_eq!(count1, 1);
        assert!(first1);

        let (count2, first2) = hub.acquire_ref("host-alpha", "tab-2");
        assert_eq!(count2, 2);
        assert!(!first2);

        let (count3, first3) = hub.acquire_ref("host-alpha", "tab-3");
        assert_eq!(count3, 3);
        assert!(!first3);
        assert_eq!(hub.active_ref_count("host-alpha"), 3);

        // Closing tabs decrements ref count; worker stays alive until last tab closes
        assert_eq!(hub.release_tab("tab-1"), 2);
        assert_eq!(hub.active_ref_count("host-alpha"), 2);

        assert_eq!(hub.release_tab("tab-2"), 1);
        assert_eq!(hub.active_ref_count("host-alpha"), 1);

        assert_eq!(hub.release_tab("tab-3"), 0);
        assert_eq!(hub.active_ref_count("host-alpha"), 0);
    }
}
