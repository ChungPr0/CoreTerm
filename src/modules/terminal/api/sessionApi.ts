import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import { Channel, invoke, listenEvent, type UnlistenFn } from "@/shared/api/tauriClient";
import { DEFAULT_CONFLICT_STRATEGY } from "@/shared/defaults";
import type { ShellProfile } from "@/shared/types/ipc";
import type {
  ConflictStrategy,
  SessionAuthPromptEventDto,
  SessionConnectAckDto,
  SessionHostKeyPromptEventDto,
  SessionStatusEventDto,
} from "../types";

export const sessionApi = {
  detectAvailableShells(refresh = false): Promise<ShellProfile[]> {
    return invoke<ShellProfile[]>("detect_available_shells", { refresh });
  },

  checkShellExe(path: string): Promise<string | null> {
    return invoke<string | null>("check_shell_exe", { path });
  },

  async pickShellExe(
    defaultPath?: string,
    filterLabels?: { executable: string; allFiles: string }
  ): Promise<string | null> {
    const isWindows = navigator.userAgent.toLowerCase().includes("windows");
    const picked = await openNativeDialog({
      multiple: false,
      directory: false,
      defaultPath: defaultPath || undefined,
      filters:
        isWindows && filterLabels
          ? [
              { name: filterLabels.executable, extensions: ["exe", "cmd", "bat", "com", "ps1"] },
              { name: filterLabels.allFiles, extensions: ["*"] },
            ]
          : undefined,
    });
    if (!picked) return null;
    return Array.isArray(picked) ? (picked[0] ?? null) : picked;
  },

  sessionConnect(params: {
    tabId: string;
    hostId: string;
    cols: number;
    rows: number;
    conflictStrategy?: ConflictStrategy;
    asAdmin?: boolean;
    shellProfile?: ShellProfile;
    onOutput: Channel<number[] | Uint8Array>;
  }): Promise<SessionConnectAckDto> {
    return invoke<SessionConnectAckDto>("session_connect", {
      req: {
        tab_id: params.tabId,
        host_id: params.hostId,
        cols: params.cols,
        rows: params.rows,
        conflict_strategy: params.conflictStrategy ?? DEFAULT_CONFLICT_STRATEGY,
        as_admin: params.asAdmin,
        shell_profile: params.shellProfile,
      },
      on_output: params.onOutput,
    });
  },

  sessionWriteStdin(tabId: string, data: number[]): Promise<void> {
    return invoke<void>("session_write_stdin", { tab_id: tabId, data });
  },

  sessionResizePty(tabId: string, cols: number, rows: number): Promise<void> {
    return invoke<void>("session_resize_pty", {
      tab_id: tabId,
      cols,
      rows,
    });
  },

  sessionSubmitSecret(
    tabId: string,
    secret: string,
    saveToVault: boolean
  ): Promise<void> {
    return invoke<void>("session_submit_secret", {
      tab_id: tabId,
      secret,
      save_to_vault: saveToVault,
    });
  },

  sessionSubmitHostKey(
    tabId: string,
    action: "ACCEPT" | "REJECT" | "REMOVE_OLD_AND_ACCEPT"
  ): Promise<void> {
    return invoke<void>("session_submit_host_key", {
      tab_id: tabId,
      action,
    });
  },

  sessionReconnect(params: {
    tabId: string;
    hostId: string;
    cols: number;
    rows: number;
    asAdmin?: boolean;
    shellProfile?: ShellProfile;
    onOutput: Channel<number[] | Uint8Array>;
  }): Promise<SessionConnectAckDto> {
    return invoke<SessionConnectAckDto>("session_reconnect", {
      req: {
        tab_id: params.tabId,
        host_id: params.hostId,
        cols: params.cols,
        rows: params.rows,
        as_admin: params.asAdmin,
        shell_profile: params.shellProfile,
      },
      on_output: params.onOutput,
    });
  },

  sessionDisconnect(tabId: string): Promise<void> {
    return invoke<void>("session_disconnect", { tab_id: tabId });
  },

  onSessionStatus(
    handler: (payload: SessionStatusEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("session:status", handler);
  },

  onAuthPrompt(
    handler: (payload: SessionAuthPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("session:auth_prompt", handler);
  },

  onHostKeyPrompt(
    handler: (payload: SessionHostKeyPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("session:host_key_prompt", handler);
  },
};

export function detectAvailableShells(refresh = false): Promise<ShellProfile[]> {
  return sessionApi.detectAvailableShells(refresh);
}
