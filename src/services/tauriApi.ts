import { invoke, Channel } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  AppStatusDto,
  ConflictStrategy,
  CreateHostRequestDto,
  GenerateSshKeyRequestDto,
  ImportSshKeyRequestDto,
  PortForwardRuleDto,
  PortProbeResultDto,
  SessionAuthPromptEventDto,
  SessionConnectAckDto,
  SessionHostKeyPromptEventDto,
  SessionStatusEventDto,
  SshKeyDto,
  TelemetryMetricsEventDto,
  UpdateHostRequestDto,
  UpsertPortForwardRequestDto,
  HostFullConfigDto,
  HostProfileSummaryDto,
} from "../types/ipc";

export const tauriApi = {
  hostList(params?: {
    group_filter?: string;
    tag_filter?: string;
    search_query?: string;
  }): Promise<HostProfileSummaryDto[]> {
    return invoke<HostProfileSummaryDto[]>("host_list", params ?? {});
  },

  hostGetDetail(hostId: string): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_get_detail", { host_id: hostId });
  },

  hostCreate(payload: CreateHostRequestDto): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_create", { ...payload });
  },

  hostUpdate(payload: UpdateHostRequestDto): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_update", { ...payload });
  },

  hostDuplicate(
    hostId: string,
    newAlias: string,
    newHost: string
  ): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_duplicate", {
      host_id: hostId,
      new_alias: newAlias,
      new_host: newHost,
    });
  },

  hostDelete(hostId: string): Promise<{ deleted: boolean }> {
    return invoke<{ deleted: boolean }>("host_delete", { host_id: hostId });
  },

  hostGroupList(): Promise<string[]> {
    return invoke<string[]>("host_group_list", {});
  },

  hostGroupCreate(name: string): Promise<string> {
    return invoke<string>("host_group_create", { name });
  },

  hostGroupDelete(name: string): Promise<{ deleted: boolean }> {
    return invoke<{ deleted: boolean }>("host_group_delete", { name });
  },

  hostMoveGroup(hostId: string, groupName: string): Promise<string> {
    return invoke<string>("host_move_group", {
      host_id: hostId,
      group_name: groupName,
    });
  },

  keyList(): Promise<SshKeyDto[]> {
    return invoke<SshKeyDto[]>("key_list", {});
  },

  keyGetDefault(): Promise<SshKeyDto | null> {
    return invoke<SshKeyDto | null>("key_get_default", {});
  },

  keyGenerate(payload: GenerateSshKeyRequestDto): Promise<SshKeyDto> {
    return invoke<SshKeyDto>("key_generate", { ...payload });
  },

  keyImport(payload: ImportSshKeyRequestDto): Promise<SshKeyDto> {
    return invoke<SshKeyDto>("key_import", { ...payload });
  },

  keySetDefault(keyId: string | null): Promise<{ updated: boolean }> {
    return invoke<{ updated: boolean }>("key_set_default", { key_id: keyId });
  },

  keyDelete(
    keyId: string,
    deleteFileFromDisk: boolean
  ): Promise<{ deleted: boolean }> {
    return invoke<{ deleted: boolean }>("key_delete", {
      key_id: keyId,
      delete_file_from_disk: deleteFileFromDisk,
    });
  },

  portForwardUpsert(
    payload: UpsertPortForwardRequestDto
  ): Promise<PortForwardRuleDto> {
    return invoke<PortForwardRuleDto>("port_forward_upsert", { ...payload });
  },

  portForwardToggle(
    ruleId: string,
    isEnabled: boolean
  ): Promise<{ rule_id: string; is_enabled: boolean }> {
    return invoke<{ rule_id: string; is_enabled: boolean }>(
      "port_forward_toggle",
      {
        rule_id: ruleId,
        is_enabled: isEnabled,
      }
    );
  },

  portForwardDelete(ruleId: string): Promise<{ deleted: boolean }> {
    return invoke<{ deleted: boolean }>("port_forward_delete", {
      rule_id: ruleId,
    });
  },

  portForwardProbe(hostId: string): Promise<PortProbeResultDto[]> {
    return invoke<PortProbeResultDto[]>("port_forward_probe", {
      host_id: hostId,
    });
  },

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
      tab_id: params.tabId,
      host_id: params.hostId,
      cols: params.cols,
      rows: params.rows,
      conflict_strategy: params.conflictStrategy ?? "AUTO_SHARE_OR_SKIP",
      as_admin: params.asAdmin,
      on_output: params.onOutput,
    });
  },

  sessionWriteStdin(tabId: string, data: number[]): Promise<void> {
    return invoke<void>("session_write_stdin", {
      tab_id: tabId,
      data,
    });
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
      tab_id: params.tabId,
      host_id: params.hostId,
      cols: params.cols,
      rows: params.rows,
      as_admin: params.asAdmin,
      on_output: params.onOutput,
    });
  },

  sessionDisconnect(tabId: string): Promise<void> {
    return invoke<void>("session_disconnect", {
      tab_id: tabId,
    });
  },

  appGetStatus(): Promise<AppStatusDto> {
    return invoke<AppStatusDto>("app_get_status", {});
  },

  clipboardReadText(): Promise<string> {
    return invoke<string>("clipboard_read_text", {});
  },

  clipboardWriteText(text: string): Promise<void> {
    return invoke<void>("clipboard_write_text", { text });
  },

  telemetrySetLocalConfig(enabled: boolean, intervalSec: number): Promise<void> {
    return invoke<void>("telemetry_set_local_config", {
      enabled,
      interval_sec: intervalSec,
    });
  },

  windowSetLaunchSize(cols: number, rows: number): Promise<void> {
    return invoke<void>("window_set_launch_size", {
      cols,
      rows,
    });
  },

  windowPresent(params?: { cols?: number; rows?: number }): Promise<void> {
    return invoke<void>("window_present", {
      cols: params?.cols ?? null,
      rows: params?.rows ?? null,
    });
  },

  windowMinimize(): Promise<void> {
    return invoke<void>("window_minimize", {});
  },

  windowToggleMaximize(): Promise<void> {
    return invoke<void>("window_toggle_maximize", {});
  },

  windowClose(): Promise<void> {
    return invoke<void>("window_close", {});
  },

  onSessionStatus(
    handler: (payload: SessionStatusEventDto) => void
  ): Promise<UnlistenFn> {
    return listen<SessionStatusEventDto>("session:status", (event) => {
      handler(event.payload);
    });
  },

  onAuthPrompt(
    handler: (payload: SessionAuthPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listen<SessionAuthPromptEventDto>("session:auth_prompt", (event) => {
      handler(event.payload);
    });
  },

  onHostKeyPrompt(
    handler: (payload: SessionHostKeyPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listen<SessionHostKeyPromptEventDto>(
      "session:host_key_prompt",
      (event) => {
        handler(event.payload);
      }
    );
  },

  onTelemetryMetrics(
    handler: (payload: TelemetryMetricsEventDto) => void
  ): Promise<UnlistenFn> {
    return listen<TelemetryMetricsEventDto>(
      "telemetry:metrics",
      (event) => {
        handler(event.payload);
      }
    );
  },
};
