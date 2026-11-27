import {
  DEFAULT_SHELL_ID,
  LOCAL_HOST_ID,
  SSH_DEFAULT_RECONNECT_SEC,
} from "@/shared/defaults";
import type {
  SessionState,
  SftpConflictPolicy,
  SftpConnectionState,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";

export const DEFAULT_LOCAL_SHELL: ShellProfile = {
  id: DEFAULT_SHELL_ID,
  kind: DEFAULT_SHELL_ID,
  name: "PowerShell",
  executable: "powershell.exe",
  args: ["-NoLogo"],
};

export function sftpToTabState(state: SftpConnectionState): SessionState {
  switch (state) {
    case "CONNECTED":
      return "ONLINE";
    case "CONNECTING":
      return "CONNECTING";
    case "ERROR":
      return "ERROR";
    case "DISCONNECTED":
    case "IDLE":
    default:
      return "DISCONNECTED";
  }
}

export function isTabOffline(tab: TerminalTabItem): boolean {
  return (
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED" ||
    tab.state === "PORT_CONFLICT"
  );
}

export function isTabConnecting(tab: TerminalTabItem): boolean {
  return tab.state === "CONNECTING" || tab.state === "HANDSHAKING";
}

export function createLocalTab(
  profile: ShellProfile | null = DEFAULT_LOCAL_SHELL,
  isAdmin = false
): TerminalTabItem {
  return {
    tabId: crypto.randomUUID(),
    hostId: LOCAL_HOST_ID,
    title: profile?.name ?? "Terminal",
    hostSubtitle: "Local",
    shellProfile: profile ?? undefined,
    state: "CONNECTING",
    errorMessage: null,
    reconnectToken: 0,
    autoReconnect: false,
    reconnectIntervalSec: SSH_DEFAULT_RECONNECT_SEC,
    isAdmin,
  };
}

export type { SftpConflictPolicy };
