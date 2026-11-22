import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import {
  EVENT_SESSION_AUTH_PROMPT,
  EVENT_SESSION_HOST_KEY_PROMPT,
  EVENT_SESSION_STATUS,
} from "@/shared/api/ipcEvents";
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
    initialCwd?: string;
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
        initial_cwd: params.initialCwd,
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
    saveToVault: boolean,
    autoReconnect?: boolean
  ): Promise<void> {
    return invoke<void>("session_submit_secret", {
      tab_id: tabId,
      secret,
      save_to_vault: saveToVault,
      auto_reconnect: autoReconnect,
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
    return listenEvent(EVENT_SESSION_STATUS, handler);
  },

  onAuthPrompt(
    handler: (payload: SessionAuthPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent(EVENT_SESSION_AUTH_PROMPT, handler);
  },

  onHostKeyPrompt(
    handler: (payload: SessionHostKeyPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent(EVENT_SESSION_HOST_KEY_PROMPT, handler);
  },

  appGetLaunchDir(): Promise<string | null> {
    return invoke<string | null>("app_get_launch_dir");
  },

  contextMenuGetStatus(): Promise<boolean> {
    return invoke<boolean>("context_menu_get_status");
  },

  contextMenuSetEnabled(enabled: boolean): Promise<boolean> {
    return invoke<boolean>("context_menu_set_enabled", { enabled });
  },
};

export function detectAvailableShells(refresh = false): Promise<ShellProfile[]> {
  return sessionApi.detectAvailableShells(refresh);
}
