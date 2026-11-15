import type {
  SessionState,
  SftpConflictPolicy,
  SftpConnectionState,
  TerminalTabItem,
} from "@/shared/types/ipc";

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

export function createLocalTab(isAdmin = false): TerminalTabItem {
  return {
    tabId: crypto.randomUUID(),
    hostId: "local",
    title: "PowerShell",
    hostSubtitle: "Local",
    state: "CONNECTING",
    errorMessage: null,
    reconnectToken: 0,
    autoReconnect: false,
    reconnectIntervalSec: 2,
    isAdmin,
  };
}

export type { SftpConflictPolicy };
