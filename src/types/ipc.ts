export type AuthMethod = "SSH_KEY" | "PASSWORD";
export type PasswordMode = "SAVED" | "PROMPT_EVERY_TIME" | "NONE";
export type StrictHostKeyChecking = "ACCEPT_NEW" | "YES" | "NO";
export type ForwardType = "LOCAL" | "REMOTE" | "DYNAMIC";
export type ConflictStrategy = "AUTO_SHARE_OR_SKIP" | "OVERRIDE_PORT" | "ABORT";

export type SessionState =
  | "CONNECTING"
  | "HANDSHAKING"
  | "ONLINE"
  | "DISCONNECTED"
  | "ERROR"
  | "AUTH_FAILED"
  | "PORT_CONFLICT";

export interface HostProfileSummaryDto {
  id: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  group_name: string;
  tags: string[];
  auth_method: AuthMethod;
  ssh_key_id: string | null;
  ssh_key_name: string | null;
  private_key_path: string | null;
  password_mode: PasswordMode;
  has_saved_password: boolean;
  active_port_forwards_count: number;
  telemetry_enabled: boolean;
  telemetry_interval_sec: number;
  auto_reconnect: boolean;
  reconnect_interval_sec: number;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SshOptionsDto {
  host_id: string;
  server_alive_interval: number;
  server_alive_count_max: number;
  compression: boolean;
  strict_host_key_checking: StrictHostKeyChecking;
  startup_command: string | null;
  forward_agent: boolean;
  telemetry_enabled: boolean;
  telemetry_interval_sec: number;
  auto_reconnect: boolean;
  reconnect_interval_sec: number;
}

export interface PortForwardRuleDto {
  id: string;
  host_id: string;
  label: string;
  forward_type: ForwardType;
  bind_address: string;
  bind_port: number;
  target_host: string | null;
  target_port: number | null;
  is_enabled: boolean;
}

export interface UpsertPortForwardRequestDto {
  id?: string;
  host_id: string;
  label: string;
  forward_type: ForwardType;
  bind_address: string;
  bind_port: number;
  target_host?: string | null;
  target_port?: number | null;
  is_enabled?: boolean;
}

export interface PortProbeResultDto {
  rule_id: string;
  bind_address: string;
  bind_port: number;
  status: "AVAILABLE" | "SHARED_WITH_ACTIVE_TAB" | "CONFLICT_EXTERNAL";
  owner_tab_id: string | null;
  conflicting_pid: number | null;
  conflicting_process_name: string | null;
}

export interface HostFullConfigDto {
  id: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  group_name: string;
  tags: string[];
  auth_method: AuthMethod;
  ssh_key_id: string | null;
  private_key_path: string | null;
  password_mode: PasswordMode;
  has_saved_password: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  options: SshOptionsDto;
  port_forwards: PortForwardRuleDto[];
}

export interface UpdateSshOptionsFieldsDto {
  server_alive_interval?: number;
  server_alive_count_max?: number;
  compression?: boolean;
  strict_host_key_checking?: StrictHostKeyChecking;
  startup_command?: string | null;
  forward_agent?: boolean;
  telemetry_enabled?: boolean;
  telemetry_interval_sec?: number;
  auto_reconnect?: boolean;
  reconnect_interval_sec?: number;
}

export interface CreateHostRequestDto {
  alias: string;
  host: string;
  port: number;
  username: string;
  group_name: string;
  tags?: string[];
  auth_method: AuthMethod;
  ssh_key_id?: string | null;
  private_key_path?: string | null;
  password_mode?: PasswordMode;
  password?: string | null;
  options?: UpdateSshOptionsFieldsDto;
}

export interface UpdateHostRequestDto extends CreateHostRequestDto {
  id: string;
}

export interface SshKeyDto {
  id: string;
  name: string;
  key_type: string;
  private_key_path: string;
  public_key_content: string | null;
  fingerprint: string;
  has_passphrase: boolean;
  has_saved_passphrase: boolean;
  is_default: boolean;
  file_exists: boolean;
  created_at: string;
}

export interface GenerateSshKeyRequestDto {
  name: string;
  key_type: "ED25519" | "RSA_4096";
  comment?: string;
  passphrase?: string;
  set_default: boolean;
}

export interface ImportSshKeyRequestDto {
  name: string;
  source_path: string;
  copy_to_managed_dir?: boolean;
  passphrase?: string;
  set_default?: boolean;
}

export interface AppStatusDto {
  is_elevated: boolean;
  has_native_border: boolean;
}

export interface SessionConnectAckDto {
  tab_id: string;
  host_id: string;
  pid: number | null;
  cli_preview: string;
  status: string;
  is_admin: boolean;
}

export interface PortForwardStatusDto {
  rule_id: string;
  bind_address: string;
  bind_port: number;
  forward_type: ForwardType;
  status: string;
  owner_tab_id?: string | null;
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
  timestamp_ms: number;
  cpu_usage_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_usage_percent: number;
  is_stale: boolean;
}

export interface TerminalTabItem {
  tabId: string;
  hostId: string;
  title: string;
  hostSubtitle: string;
  state: SessionState;
  errorMessage?: string | null;
  reconnectToken: number;
  conflictStrategy?: ConflictStrategy;
  activeForwards?: PortForwardStatusDto[];
  telemetryEnabled?: boolean;
  autoReconnect?: boolean;
  reconnectIntervalSec?: number;
  isAdmin?: boolean;
}
