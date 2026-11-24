export type SftpConflictPolicy = "ASK" | "OVERWRITE" | "SKIP" | "RENAME" | "RESUME";
export type ForwardType = "LOCAL" | "REMOTE" | "DYNAMIC";
export type ConflictStrategy = "AUTO_SHARE_OR_SKIP" | "OVERRIDE_PORT" | "ABORT";
export type ShellKind = "powershell" | "pwsh" | "cmd" | "git-bash" | "wsl" | "custom";
export type StrictHostKeyChecking = "ACCEPT_NEW" | "YES" | "NO";
export type SettingsCategoryId =
  | "general"
  | "startup"
  | "terminal"
  | "shells"
  | "ssh"
  | "sftp"
  | "editor";

export interface ShellProfile {
  id: string;
  kind: ShellKind | string;
  name: string;
  executable: string;
  args: string[];
}

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

export interface EditorTabMeta {
  kind: "local" | "remote";
  path: string;
  name: string;
  hostLabel: string;
  dirty?: boolean;
}

export interface FileContentDto {
  path: string;
  content: string;
  size: number;
  mtime_ms?: number | null;
  readonly: boolean;
}

export interface FileWriteResultDto {
  path: string;
  size: number;
  mtime_ms?: number | null;
}

export interface TerminalTabItem {
  tabId: string;
  hostId: string;
  title: string;
  hostSubtitle: string;
  shellProfile?: ShellProfile;
  state: SessionState;
  errorMessage?: string | null;
  reconnectToken: number;
  conflictStrategy?: ConflictStrategy;
  activeForwards?: PortForwardStatusDto[];
  autoReconnect?: boolean;
  canAutoReconnect?: boolean;
  reconnectIntervalSec?: number;
  isAdmin?: boolean;
  initialCwd?: string;
  tabKind?: "terminal" | "sftp" | "editor" | "settings";
  settingsSection?: SettingsCategoryId;
  sftpOpen?: boolean;
  sftpSplitRatio?: number;
  sftpState?: SftpConnectionState;
  reconnectSource?: "tab" | "auto" | "banner";
  editorFile?: EditorTabMeta;
}
