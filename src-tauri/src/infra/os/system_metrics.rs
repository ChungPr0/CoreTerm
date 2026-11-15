#[derive(Debug, Clone)]
pub struct CpuSample {
    pub total: u64,
    pub idle: u64,
}

#[derive(Debug, Clone)]
pub struct MemSample {
    pub used_mb: u64,
    pub total_mb: u64,
    pub usage_percent: f32,
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

pub fn sample_local_cpu() -> Option<CpuSample> {
    #[cfg(windows)]
    unsafe {
        let mut idle: u64 = 0;
        let mut kernel: u64 = 0;
        let mut user: u64 = 0;
        if GetSystemTimes(&mut idle, &mut kernel, &mut user) != 0 {
            return Some(CpuSample {
                total: kernel.saturating_add(user),
                idle,
            });
        }
    }
    None
}

pub fn sample_local_mem() -> Option<MemSample> {
    #[cfg(windows)]
    unsafe {
        let mut status: MemoryStatusEx = std::mem::zeroed();
        status.dw_length = std::mem::size_of::<MemoryStatusEx>() as u32;
        if GlobalMemoryStatusEx(&mut status) != 0 && status.ull_total_phys > 0 {
            let total_mb = status.ull_total_phys / (1024 * 1024);
            let avail_mb = status.ull_avail_phys / (1024 * 1024);
            return Some(MemSample {
                used_mb: total_mb.saturating_sub(avail_mb),
                total_mb,
                usage_percent: (status.dw_memory_load as f32).clamp(0.0, 100.0),
            });
        }
    }
    None
}
