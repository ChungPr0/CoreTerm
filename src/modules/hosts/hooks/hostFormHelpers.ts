import type {
  AuthMethod,
  CreateHostRequestDto,
  DraftPortForward,
  HostFullConfigDto,
  PasswordMode,
  StrictHostKeyChecking,
} from "../types";

export interface HostFormFields {
  alias: string;
  host: string;
  port: number;
  username: string;
  groupName: string;
  tagsInput: string;
  authMethod: AuthMethod;
  passwordMode: PasswordMode;
  password: string;
  selectedKeyId: string;
  privateKeyPath: string;
  serverAliveInterval: number;
  strictHostKeyChecking: StrictHostKeyChecking;
  compression: boolean;
  forwardAgent: boolean;
  startupCommand: string;
  autoReconnect: boolean;
  reconnectIntervalSec: number;
  forwards: DraftPortForward[];
}

export const clampReconnectInterval = (v: number): number =>
  Math.min(Math.max(Number(v) || 2, 1), 60);

export function createHostFormFields(
  editingHost: HostFullConfigDto | null,
  initialGroupName?: string
): HostFormFields {
  if (editingHost) {
    return {
      alias: editingHost.alias,
      host: editingHost.host,
      port: editingHost.port,
      username: editingHost.username,
      groupName: editingHost.group_name || "Default",
      tagsInput: editingHost.tags.join(", "),
      authMethod: editingHost.auth_method,
      passwordMode: editingHost.password_mode === "SAVED" ? "SAVED" : "PROMPT_EVERY_TIME",
      password: "",
      selectedKeyId: editingHost.ssh_key_id ?? "",
      privateKeyPath: editingHost.private_key_path ?? "",
      serverAliveInterval: editingHost.options.server_alive_interval,
      strictHostKeyChecking: editingHost.options.strict_host_key_checking,
      compression: editingHost.options.compression,
      forwardAgent: editingHost.options.forward_agent,
      startupCommand: editingHost.options.startup_command ?? "",
      autoReconnect: editingHost.options.auto_reconnect,
      reconnectIntervalSec: editingHost.options.reconnect_interval_sec,
      forwards: editingHost.port_forwards.map((pf) => ({
        id: pf.id,
        label: pf.label,
        forward_type: pf.forward_type,
        bind_address: pf.bind_address,
        bind_port: pf.bind_port,
        target_host: pf.target_host ?? "localhost",
        target_port: pf.target_port ?? 80,
        is_enabled: pf.is_enabled,
      })),
    };
  }

  return {
    alias: "",
    host: "",
    port: 22,
    username: "root",
    groupName: initialGroupName?.trim() || "Default",
    tagsInput: "",
    authMethod: "PASSWORD",
    passwordMode: "PROMPT_EVERY_TIME",
    password: "",
    selectedKeyId: "",
    privateKeyPath: "",
    serverAliveInterval: 60,
    strictHostKeyChecking: "ACCEPT_NEW",
    compression: false,
    forwardAgent: false,
    startupCommand: "",
    autoReconnect: false,
    reconnectIntervalSec: 2,
    forwards: [],
  };
}

export type HostPayloadResult =
  | { ok: true; payload: CreateHostRequestDto }
  | { ok: false; errorKey: string };

export function validateAndBuildHostPayload(fields: HostFormFields): HostPayloadResult {
  const cleanAlias = fields.alias.trim();
  const cleanHost = fields.host.trim();
  const cleanUsername = fields.username.trim();
  const portNum = Number(fields.port);

  if (!cleanAlias) return { ok: false, errorKey: "errors.host_alias_empty" };
  if (!cleanHost) return { ok: false, errorKey: "errors.host_host_empty" };
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, errorKey: "errors.host_port_range" };
  }
  if (!cleanUsername) return { ok: false, errorKey: "errors.host_username_empty" };
  if (
    fields.authMethod === "SSH_KEY" &&
    !fields.selectedKeyId &&
    !fields.privateKeyPath.trim()
  ) {
    return { ok: false, errorKey: "errors.key_binding_required" };
  }

  return {
    ok: true,
    payload: {
      alias: cleanAlias,
      host: cleanHost,
      port: portNum,
      username: cleanUsername,
      group_name: fields.groupName.trim() || "Default",
      tags: fields.tagsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      auth_method: fields.authMethod,
      ssh_key_id:
        fields.authMethod === "SSH_KEY" && fields.selectedKeyId ? fields.selectedKeyId : null,
      private_key_path:
        fields.authMethod === "SSH_KEY" &&
        !fields.selectedKeyId &&
        fields.privateKeyPath.trim()
          ? fields.privateKeyPath.trim()
          : null,
      password_mode: fields.authMethod === "PASSWORD" ? fields.passwordMode : "NONE",
      password:
        fields.authMethod === "PASSWORD" &&
        fields.passwordMode === "SAVED" &&
        fields.password
          ? fields.password
          : null,
      options: {
        server_alive_interval: Number(fields.serverAliveInterval) || 0,
        server_alive_count_max: 3,
        compression: fields.compression,
        strict_host_key_checking: fields.strictHostKeyChecking,
        forward_agent: fields.forwardAgent,
        startup_command: fields.startupCommand.trim() || null,
        auto_reconnect: fields.autoReconnect,
        reconnect_interval_sec: clampReconnectInterval(fields.reconnectIntervalSec),
      },
      port_forwards: fields.forwards.map((pf) => ({
        id: pf.id ?? null,
        label: pf.label,
        forward_type: pf.forward_type,
        bind_address: pf.bind_address,
        bind_port: pf.bind_port,
        target_host: pf.forward_type === "DYNAMIC" ? null : pf.target_host,
        target_port: pf.forward_type === "DYNAMIC" ? null : pf.target_port,
        is_enabled: pf.is_enabled,
      })),
    },
  };
}
