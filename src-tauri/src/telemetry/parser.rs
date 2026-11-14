#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CpuJiffies {
    pub total: u64,
    pub idle: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MemStats {
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_usage_percent: f32,
    pub swap_used_mb: u64,
    pub swap_total_mb: u64,
}

/// Parses aggregate `cpu ` line from `/proc/stat` into total and idle jiffies.
pub fn parse_proc_stat(content: &str) -> Option<CpuJiffies> {
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("cpu ") {
            let nums: Vec<u64> = trimmed
                .split_whitespace()
                .skip(1)
                .take(8)
                .filter_map(|v| v.parse::<u64>().ok())
                .collect();

            if nums.len() < 4 {
                return None;
            }

            let total: u64 = nums.iter().sum();
            let idle_base = nums[3];
            let iowait = nums.get(4).copied().unwrap_or(0);
            return Some(CpuJiffies {
                total,
                idle: idle_base.saturating_add(iowait),
            });
        }
    }
    None
}

/// Calculates CPU usage percentage from delta jiffies between two consecutive snapshots.
pub fn compute_cpu_delta(prev: &CpuJiffies, curr: &CpuJiffies) -> f32 {
    let delta_total = curr.total.saturating_sub(prev.total);
    let delta_idle = curr.idle.saturating_sub(prev.idle);
    if delta_total == 0 {
        return 0.0;
    }
    let busy_ratio = 1.0 - (delta_idle as f64 / delta_total as f64);
    ((busy_ratio * 100.0).clamp(0.0, 100.0) as f32 * 10.0).round() / 10.0
}

/// Parses `/proc/meminfo` and computes RAM Used = MemTotal - MemAvailable in MB.
pub fn parse_proc_meminfo(content: &str) -> Option<MemStats> {
    let mut mem_total_kb: Option<u64> = None;
    let mut mem_available_kb: Option<u64> = None;
    let mut mem_free_kb: u64 = 0;
    let mut buffers_kb: u64 = 0;
    let mut cached_kb: u64 = 0;
    let mut swap_total_kb: u64 = 0;
    let mut swap_free_kb: u64 = 0;

    for line in content.lines() {
        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else {
            continue;
        };
        let Some(val_str) = parts.next() else {
            continue;
        };
        let Ok(val) = val_str.parse::<u64>() else {
            continue;
        };

        match key {
            "MemTotal:" => mem_total_kb = Some(val),
            "MemAvailable:" => mem_available_kb = Some(val),
            "MemFree:" => mem_free_kb = val,
            "Buffers:" => buffers_kb = val,
            "Cached:" => cached_kb = val,
            "SwapTotal:" => swap_total_kb = val,
            "SwapFree:" => swap_free_kb = val,
            _ => {}
        }
    }

    let total_kb = mem_total_kb?;
    if total_kb == 0 {
        return None;
    }

    let avail_kb = mem_available_kb.unwrap_or_else(|| {
        mem_free_kb
            .saturating_add(buffers_kb)
            .saturating_add(cached_kb)
    });

    let used_kb = total_kb.saturating_sub(avail_kb);
    let ram_used_mb = used_kb / 1024;
    let ram_total_mb = total_kb / 1024;
    let ram_usage_percent =
        (((used_kb as f64 / total_kb as f64) * 100.0).clamp(0.0, 100.0) as f32 * 10.0).round()
            / 10.0;

    let swap_used_kb = swap_total_kb.saturating_sub(swap_free_kb);
    let swap_used_mb = swap_used_kb / 1024;
    let swap_total_mb = swap_total_kb / 1024;

    Some(MemStats {
        ram_used_mb,
        ram_total_mb,
        ram_usage_percent,
        swap_used_mb,
        swap_total_mb,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_proc_stat_and_delta_cpu() {
        let snap1 = "cpu  1000 100 500 8000 400 0 0 0 0 0\ncpu0 500 50 250 4000 200 0 0 0 0 0\n";
        let snap2 = "cpu  1250 100 650 8500 500 0 0 0 0 0\ncpu0 625 50 325 4250 250 0 0 0 0 0\n";

        let j1 = parse_proc_stat(snap1).expect("parse snapshot 1");
        let j2 = parse_proc_stat(snap2).expect("parse snapshot 2");

        // snap1: total = 10000, idle = 8000 + 400 = 8400
        assert_eq!(j1.total, 10000);
        assert_eq!(j1.idle, 8400);

        // snap2: total = 11000, idle = 8500 + 500 = 9000
        // delta_total = 1000, delta_idle = 600 -> busy = 400 / 1000 = 40.0%
        assert_eq!(j2.total, 11000);
        assert_eq!(j2.idle, 9000);

        let cpu_pct = compute_cpu_delta(&j1, &j2);
        assert!((cpu_pct - 40.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_proc_meminfo() {
        let sample = r#"
MemTotal:        8192000 kB
MemFree:         1024000 kB
MemAvailable:    3072000 kB
Buffers:          512000 kB
Cached:          1536000 kB
SwapTotal:       2048000 kB
SwapFree:        1536000 kB
"#;

        let stats = parse_proc_meminfo(sample).expect("parse meminfo");
        // Total = 8000 MB, Available = 3000 MB -> Used = 5000 MB (62.5%)
        assert_eq!(stats.ram_total_mb, 8000);
        assert_eq!(stats.ram_used_mb, 5000);
        assert!((stats.ram_usage_percent - 62.5).abs() < 0.01);
        assert_eq!(stats.swap_total_mb, 2000);
        assert_eq!(stats.swap_used_mb, 500);
    }
}
