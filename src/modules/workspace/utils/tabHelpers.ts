import type {
  SessionState,
  SftpConflictPolicy,
  SftpConnectionState,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";

export const DEFAULT_LOCAL_SHELL: ShellProfile = {
  id: "powershell",
  kind: "powershell",
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

export function createLocalTab(
  profile: ShellProfile = DEFAULT_LOCAL_SHELL,
  isAdmin = false
): TerminalTabItem {
  return {
    tabId: crypto.randomUUID(),
    hostId: "local",
    title: profile.name,
    hostSubtitle: "Local",
    shellProfile: profile,
    state: "CONNECTING",
    errorMessage: null,
    reconnectToken: 0,
    autoReconnect: false,
    reconnectIntervalSec: 2,
    isAdmin,
  };
}

export type { SftpConflictPolicy };
