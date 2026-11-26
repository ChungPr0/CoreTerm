import type {
  ConflictStrategy,
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  ShellKind,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";

export type {
  ConflictStrategy,
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  ShellKind,
  ShellProfile,
  TerminalTabItem,
};

export interface AppStatusDto {
  is_elevated: boolean;
  has_native_border: boolean;
  is_secondary_window?: boolean;
}
