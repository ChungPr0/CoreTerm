import type { ConflictStrategy, PortForwardStatusDto, SessionState } from "@/shared/types/ipc";

export type { ConflictStrategy, PortForwardStatusDto };

export interface SessionConnectAckDto {
  tab_id: string;
  host_id: string;
  pid: number | null;
  cli_preview: string;
  status: string;
  is_admin: boolean;
}

export interface SessionStatusEventDto {
  tab_id: string;
  host_id: string;
  state: SessionState;
  active_local_forwards: PortForwardStatusDto[];
  error_message?: string | null;
}

export interface SessionAuthPromptEventDto {
  tab_id: string;
  host_id: string;
  prompt_type: "PASSWORD" | "KEY_PASSPHRASE";
  prompt_text: string;
  attempt: number;
}

export interface SessionHostKeyPromptEventDto {
  tab_id: string;
  host_id: string;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  reason: string;
}

export interface TelemetryMetricsEventDto {
  host_id: string;
  cpu_usage_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_usage_percent: number;
  swap_used_mb: number;
  swap_total_mb: number;
  is_stale: boolean;
  sampled_at_ms: number;
}
