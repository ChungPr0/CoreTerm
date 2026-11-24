import { DEFAULT_HOST_GROUP } from "@/shared/defaults";
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

export function isAutoReconnectAllowed(
  authMethod: AuthMethod | string,
  passwordMode?: PasswordMode | string | null
): boolean {
  return authMethod === "SSH_KEY" || (authMethod === "PASSWORD" && passwordMode === "SAVED");
}

export interface SshFormDefaults {
  username?: string;
  port?: number;
  serverAliveInterval?: number;
  strictHostKeyChecking?: StrictHostKeyChecking;
  compression?: boolean;
  forwardAgent?: boolean;
  autoReconnect?: boolean;
  reconnectIntervalSec?: number;
}

export function createHostFormFields(
  editingHost: HostFullConfigDto | null,
  initialGroupName?: string,
  sshDefaults?: SshFormDefaults
): HostFormFields {
  if (editingHost) {
    return {
      alias: editingHost.alias,
      host: editingHost.host,
      port: editingHost.port,
      username: editingHost.username,
      groupName: editingHost.group_name || DEFAULT_HOST_GROUP,
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
    port: sshDefaults?.port ?? 22,
    username: sshDefaults?.username?.trim() || "root",
    groupName: initialGroupName?.trim() || DEFAULT_HOST_GROUP,
    tagsInput: "",
    authMethod: "PASSWORD",
    passwordMode: "PROMPT_EVERY_TIME",
    password: "",
    selectedKeyId: "",
    privateKeyPath: "",
    serverAliveInterval: sshDefaults?.serverAliveInterval ?? 60,
    strictHostKeyChecking: sshDefaults?.strictHostKeyChecking ?? "ACCEPT_NEW",
    compression: sshDefaults?.compression ?? false,
    forwardAgent: sshDefaults?.forwardAgent ?? false,
    startupCommand: "",
    autoReconnect: sshDefaults?.autoReconnect ?? false,
    reconnectIntervalSec: sshDefaults?.reconnectIntervalSec ?? 2,
    forwards: [],
  };
}

export type HostPayloadResult =
  | { ok: true; payload: CreateHostRequestDto }
  | { ok: false; errorKey: string; errorParams?: Record<string, string | number> };

export function validateAndBuildHostPayload(
  fields: HostFormFields,
  hasSavedPassword = false
): HostPayloadResult {
  const cleanAlias = fields.alias.trim();
  const cleanHost = fields.host.trim();
  const cleanUsername = fields.username.trim();
  const portNum = Number(fields.port);

  if (!cleanAlias) return { ok: false, errorKey: "errors.host_alias_empty" };
  if (!cleanHost) return { ok: false, errorKey: "errors.host_host_empty" };
  if (cleanHost.startsWith("-")) return { ok: false, errorKey: "errors.host_host_invalid_hyphen" };
  if (/\s/.test(cleanHost) || /[\x00-\x1F\x7F]/.test(cleanHost)) {
    return { ok: false, errorKey: "errors.host_host_invalid_chars" };
  }
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, errorKey: "errors.host_port_range" };
  }
  if (!cleanUsername) return { ok: false, errorKey: "errors.host_username_empty" };
  if (cleanUsername.startsWith("-")) return { ok: false, errorKey: "errors.host_username_invalid_hyphen" };
  if (/\s/.test(cleanUsername) || /[\x00-\x1F\x7F]/.test(cleanUsername)) {
    return { ok: false, errorKey: "errors.host_username_invalid_chars" };
  }
  if (
    fields.authMethod === "SSH_KEY" &&
    !fields.selectedKeyId &&
    !fields.privateKeyPath.trim()
  ) {
    return { ok: false, errorKey: "errors.key_binding_required" };
  }
  if (
    fields.authMethod === "PASSWORD" &&
    fields.passwordMode === "SAVED" &&
    !hasSavedPassword &&
    !fields.password
  ) {
    return { ok: false, errorKey: "errors.host_password_empty" };
  }

  for (const pf of fields.forwards) {
    const bindPortNum = Number(pf.bind_port);
    if (!Number.isInteger(bindPortNum) || bindPortNum < 1 || bindPortNum > 65535) {
      return { ok: false, errorKey: "errors.forward_port_range" };
    }
    const cleanBindAddr = pf.bind_address.trim();
    if (cleanBindAddr.startsWith("-") || /\s/.test(cleanBindAddr) || /[;`&$|]/.test(cleanBindAddr)) {
      return { ok: false, errorKey: "errors.forward_bind_address_invalid" };
    }
    if (pf.forward_type !== "DYNAMIC") {
      const cleanTargetHost = (pf.target_host || "").trim();
      const targetPortNum = Number(pf.target_port);
      if (!cleanTargetHost) {
        return { ok: false, errorKey: "errors.forward_target_required" };
      }
      if (cleanTargetHost.startsWith("-") || /\s/.test(cleanTargetHost) || /[;`&$|]/.test(cleanTargetHost)) {
        return { ok: false, errorKey: "errors.forward_target_host_invalid" };
      }
      if (!Number.isInteger(targetPortNum) || targetPortNum < 1 || targetPortNum > 65535) {
        return { ok: false, errorKey: "errors.forward_port_range" };
      }
    }
  }

  const normalizeAddr = (addr: string) => {
    const t = addr.trim().toLowerCase();
    return !t || t === "localhost" ? "127.0.0.1" : t;
  };

  const enabledForwards = fields.forwards.filter((r) => r.is_enabled);
  for (let i = 0; i < enabledForwards.length; i++) {
    for (let j = i + 1; j < enabledForwards.length; j++) {
      const a = enabledForwards[i];
      const b = enabledForwards[j];
      const aIsLocal = a.forward_type === "LOCAL" || a.forward_type === "DYNAMIC";
      const bIsLocal = b.forward_type === "LOCAL" || b.forward_type === "DYNAMIC";

      if (aIsLocal && bIsLocal && a.bind_port === b.bind_port) {
        const addrA = normalizeAddr(a.bind_address);
        const addrB = normalizeAddr(b.bind_address);
        if (addrA === addrB || addrA === "0.0.0.0" || addrB === "0.0.0.0") {
          return {
            ok: false,
            errorKey: "errors.forward_duplicate_local_port",
            errorParams: { port: a.bind_port },
          };
        }
      } else if (a.forward_type === "REMOTE" && b.forward_type === "REMOTE" && a.bind_port === b.bind_port) {
        const addrA = normalizeAddr(a.bind_address);
        const addrB = normalizeAddr(b.bind_address);
        if (addrA === addrB || addrA === "0.0.0.0" || addrB === "0.0.0.0") {
          return {
            ok: false,
            errorKey: "errors.forward_duplicate_remote_port",
            errorParams: { port: a.bind_port },
          };
        }
      }
    }
  }

  return {
    ok: true,
    payload: {
      alias: cleanAlias,
      host: cleanHost,
      port: portNum,
      username: cleanUsername,
      group_name: fields.groupName.trim() || DEFAULT_HOST_GROUP,
      tags: Array.from(
        new Set(
          fields.tagsInput
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ),
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
        auto_reconnect: isAutoReconnectAllowed(fields.authMethod, fields.passwordMode) && fields.autoReconnect,
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
