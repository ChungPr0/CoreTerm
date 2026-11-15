import type {
  ConflictStrategy,
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  TerminalTabItem,
} from "@/shared/types/ipc";

export type {
  ConflictStrategy,
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  TerminalTabItem,
};

export interface AppStatusDto {
  is_elevated: boolean;
  has_native_border: boolean;
}
