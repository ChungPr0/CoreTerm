export type SftpConflictPolicy = "ASK" | "OVERWRITE" | "SKIP" | "RENAME" | "RESUME";
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

export type SftpConnectionState =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR";

export interface AppErrorDto {
  code: string;
  subcode?: string;
  message: string;
}

export interface DeleteResultDto {
  deleted: boolean;
}

export interface PortForwardStatusDto {
  rule_id: string;
  bind_address: string;
  bind_port: number;
  forward_type: ForwardType;
  status: string;
  owner_tab_id?: string | null;
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
  tabKind?: "terminal" | "sftp";
  sftpOpen?: boolean;
  sftpSplitRatio?: number;
  sftpState?: SftpConnectionState;
}
