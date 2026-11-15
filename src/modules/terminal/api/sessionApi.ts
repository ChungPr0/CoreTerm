import { Channel, invoke, listenEvent, type UnlistenFn } from "@/shared/api/tauriClient";
import type {
  ConflictStrategy,
  SessionAuthPromptEventDto,
  SessionConnectAckDto,
  SessionHostKeyPromptEventDto,
  SessionStatusEventDto,
} from "../types";

export const sessionApi = {
  sessionConnect(params: {
    tabId: string;
    hostId: string;
    cols: number;
    rows: number;
    conflictStrategy?: ConflictStrategy;
    asAdmin?: boolean;
    onOutput: Channel<number[] | Uint8Array>;
  }): Promise<SessionConnectAckDto> {
    return invoke<SessionConnectAckDto>("session_connect", {
      req: {
        tab_id: params.tabId,
        host_id: params.hostId,
        cols: params.cols,
        rows: params.rows,
        conflict_strategy: params.conflictStrategy ?? "AUTO_SHARE_OR_SKIP",
        as_admin: params.asAdmin,
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
    onOutput: Channel<number[] | Uint8Array>;
  }): Promise<SessionConnectAckDto> {
    return invoke<SessionConnectAckDto>("session_reconnect", {
      req: {
        tab_id: params.tabId,
        host_id: params.hostId,
        cols: params.cols,
        rows: params.rows,
        as_admin: params.asAdmin,
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
