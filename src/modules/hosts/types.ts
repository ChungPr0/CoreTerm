import type { ForwardType, StrictHostKeyChecking } from "@/shared/types/ipc";

export type { StrictHostKeyChecking };
export type AuthMethod = "SSH_KEY" | "PASSWORD";
export type PasswordMode = "SAVED" | "PROMPT_EVERY_TIME" | "NONE";

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
  status:
    | "AVAILABLE"
    | "SHARED_WITH_ACTIVE_TAB"
    | "CONFLICT_EXTERNAL"
    | "PERMISSION_DENIED"
    | "INVALID_PORT"
    | "INVALID_ADDRESS"
    | "ADDR_NOT_AVAILABLE"
    | "BIND_FAILED";
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
  auto_reconnect?: boolean;
  reconnect_interval_sec?: number;
}

export interface SavePortForwardDto {
  id?: string | null;
  label: string;
  forward_type: ForwardType;
  bind_address: string;
  bind_port: number;
  target_host?: string | null;
  target_port?: number | null;
  is_enabled: boolean;
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
  port_forwards?: SavePortForwardDto[];
}

export interface UpdateHostRequestDto extends CreateHostRequestDto {
  id: string;
}

export interface DraftPortForward {
  id?: string;
  label: string;
  forward_type: ForwardType;
  bind_address: string;
  bind_port: number;
  target_host: string;
  target_port: number;
  is_enabled: boolean;
}
