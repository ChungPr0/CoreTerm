use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryMetricsEventDto {
    pub host_id: String,
    pub cpu_usage_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_usage_percent: f32,
    pub swap_used_mb: u64,
    pub swap_total_mb: u64,
    pub is_stale: bool,
    pub sampled_at_ms: u64,
}
