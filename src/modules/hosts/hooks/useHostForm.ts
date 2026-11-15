import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuthMethod,
  CreateHostRequestDto,
  DraftPortForward,
  HostFullConfigDto,
  PasswordMode,
  StrictHostKeyChecking,
  UpdateHostRequestDto,
} from "../types";
import { hostsApi } from "../api/hostsApi";
import { keysApi, type SshKeyDto } from "@/modules/keys";
import { useI18n } from "@/shared/i18n";
import { useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";

const clampInterval = (v: number) => Math.min(Math.max(Number(v) || 2, 1), 60);

interface UseHostFormArgs {
  isOpen: boolean;
  editingHost: HostFullConfigDto | null;
  initialGroupName?: string;
  keysVersion: number;
  onClose: () => void;
  onSaved: (saved: HostFullConfigDto) => void;
}

export function useHostForm({
  isOpen,
  editingHost,
  initialGroupName,
  keysVersion,
  onClose,
  onSaved,
}: UseHostFormArgs) {
  const { t } = useI18n();
  const alert = useAlert();

  const [alias, setAlias] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number>(22);
  const [username, setUsername] = useState("root");
  const [groupName, setGroupName] = useState("Default");
  const [tagsInput, setTagsInput] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("PASSWORD");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("PROMPT_EVERY_TIME");
  const [password, setPassword] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [privateKeyPath, setPrivateKeyPath] = useState<string>("");

  const [serverAliveInterval, setServerAliveInterval] = useState<number>(60);
  const [strictHostKeyChecking, setStrictHostKeyChecking] =
    useState<StrictHostKeyChecking>("ACCEPT_NEW");
  const [compression, setCompression] = useState<boolean>(false);
  const [forwardAgent, setForwardAgent] = useState<boolean>(false);
  const [startupCommand, setStartupCommand] = useState<string>("");
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean>(false);
  const [telemetryIntervalSec, setTelemetryIntervalSec] = useState<number>(2);
  const [autoReconnect, setAutoReconnect] = useState<boolean>(false);
  const [reconnectIntervalSec, setReconnectIntervalSec] = useState<number>(2);

  const [forwards, setForwards] = useState<DraftPortForward[]>([]);
  const [pendingDeleteRuleIdx, setPendingDeleteRuleIdx] = useState<number | null>(null);
  const [savedKeys, setSavedKeys] = useState<SshKeyDto[]>([]);
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const prevKeysVersionRef = useRef<number>(keysVersion);
  const authStateRef = useRef({ authMethod, selectedKeyId, privateKeyPath });
  authStateRef.current = { authMethod, selectedKeyId, privateKeyPath };

  useEffect(() => {
    if (!isOpen) return;
    setPendingDeleteRuleIdx(null);
    setIsGroupMenuOpen(false);

    if (editingHost) {
      setAlias(editingHost.alias);
      setHost(editingHost.host);
      setPort(editingHost.port);
      setUsername(editingHost.username);
      setGroupName(editingHost.group_name || "Default");
      setTagsInput(editingHost.tags.join(", "));
      setAuthMethod(editingHost.auth_method);
      setPasswordMode(
        editingHost.password_mode === "SAVED" ? "SAVED" : "PROMPT_EVERY_TIME"
      );
      setPassword("");
      setSelectedKeyId(editingHost.ssh_key_id ?? "");
      setPrivateKeyPath(editingHost.private_key_path ?? "");
      setServerAliveInterval(editingHost.options.server_alive_interval);
      setStrictHostKeyChecking(editingHost.options.strict_host_key_checking);
      setCompression(editingHost.options.compression);
      setForwardAgent(editingHost.options.forward_agent);
      setStartupCommand(editingHost.options.startup_command ?? "");
      setTelemetryEnabled(editingHost.options.telemetry_enabled);
      setTelemetryIntervalSec(editingHost.options.telemetry_interval_sec);
      setAutoReconnect(editingHost.options.auto_reconnect);
      setReconnectIntervalSec(editingHost.options.reconnect_interval_sec);
      setForwards(
        editingHost.port_forwards.map((pf) => ({
          id: pf.id,
          label: pf.label,
          forward_type: pf.forward_type,
          bind_address: pf.bind_address,
          bind_port: pf.bind_port,
          target_host: pf.target_host ?? "localhost",
          target_port: pf.target_port ?? 80,
          is_enabled: pf.is_enabled,
        }))
      );
      return;
    }

    setAlias("");
    setHost("");
    setPort(22);
    setUsername("root");
    setGroupName(initialGroupName?.trim() || "Default");
    setTagsInput("");
    setAuthMethod("PASSWORD");
    setPasswordMode("PROMPT_EVERY_TIME");
    setPassword("");
    setSelectedKeyId("");
    setPrivateKeyPath("");
    setServerAliveInterval(60);
    setStrictHostKeyChecking("ACCEPT_NEW");
    setCompression(false);
    setForwardAgent(false);
    setStartupCommand("");
    setTelemetryEnabled(false);
    setTelemetryIntervalSec(2);
    setAutoReconnect(false);
    setReconnectIntervalSec(2);
    setForwards([]);

    keysApi
      .keyGetDefault()
      .then((defKey) => {
        if (defKey) {
          setAuthMethod("SSH_KEY");
          setSelectedKeyId(defKey.id);
          setPrivateKeyPath(defKey.private_key_path);
        }
      })
      .catch(() => {});
  }, [isOpen, editingHost, initialGroupName]);

  useEffect(() => {
    if (!isOpen) {
      prevKeysVersionRef.current = keysVersion;
      return;
    }
    const keysUpdatedWhileOpen = prevKeysVersionRef.current !== keysVersion;
    prevKeysVersionRef.current = keysVersion;

    keysApi
      .keyList()
      .then((list) => {
        setSavedKeys(list);
        const cur = authStateRef.current;
        if (cur.selectedKeyId) {
          const existing = list.find((k) => k.id === cur.selectedKeyId);
          if (!existing) {
            setSelectedKeyId("");
            setPrivateKeyPath("");
          } else {
            setPrivateKeyPath(existing.private_key_path);
          }
        } else if (
          keysUpdatedWhileOpen &&
          cur.authMethod === "SSH_KEY" &&
          !cur.privateKeyPath.trim()
        ) {
          const defKey =
            list.find((k) => k.is_default) ?? (list.length === 1 ? list[0] : undefined);
          if (defKey) {
            setSelectedKeyId(defKey.id);
            setPrivateKeyPath(defKey.private_key_path);
          }
        }
      })
      .catch(() => {});
  }, [isOpen, keysVersion]);

  const handleSelectSavedKey = useCallback(
    (keyId: string) => {
      setSelectedKeyId(keyId);
      if (!keyId) {
        setPrivateKeyPath("");
        return;
      }
      const found = savedKeys.find((k) => k.id === keyId);
      if (found) setPrivateKeyPath(found.private_key_path);
    },
    [savedKeys]
  );

  const handleAddRule = useCallback((rule: DraftPortForward) => {
    setForwards((prev) => [...prev, rule]);
  }, []);

  const handleToggleRule = useCallback(
    async (idx: number) => {
      const target = forwards[idx];
      const nextState = !target.is_enabled;
      setForwards((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, is_enabled: nextState } : item))
      );
      if (target.id) {
        await hostsApi.portForwardToggle(target.id, nextState).catch(() => {});
      }
    },
    [forwards]
  );

  const confirmRemoveRule = useCallback(() => {
    if (pendingDeleteRuleIdx === null) return;
    setForwards((prev) => prev.filter((_, i) => i !== pendingDeleteRuleIdx));
    setPendingDeleteRuleIdx(null);
  }, [pendingDeleteRuleIdx]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAlias = alias.trim();
    const cleanHost = host.trim();
    const cleanUsername = username.trim();
    const portNum = Number(port);

    if (!cleanAlias) return void alert.error(t("errors.host_alias_empty"));
    if (!cleanHost) return void alert.error(t("errors.host_host_empty"));
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return void alert.error(t("errors.host_port_range"));
    }
    if (!cleanUsername) return void alert.error(t("errors.host_username_empty"));
    if (authMethod === "SSH_KEY" && !selectedKeyId && !privateKeyPath.trim()) {
      return void alert.error(t("errors.key_binding_required"));
    }

    setIsSaving(true);
    try {
      const payload: CreateHostRequestDto = {
        alias: cleanAlias,
        host: cleanHost,
        port: portNum,
        username: cleanUsername,
        group_name: groupName.trim() || "Default",
        tags: tagsInput.split(",").map((s) => s.trim()).filter(Boolean),
        auth_method: authMethod,
        ssh_key_id: authMethod === "SSH_KEY" && selectedKeyId ? selectedKeyId : null,
        private_key_path:
          authMethod === "SSH_KEY" && !selectedKeyId && privateKeyPath.trim()
            ? privateKeyPath.trim()
            : null,
        password_mode: authMethod === "PASSWORD" ? passwordMode : "NONE",
        password:
          authMethod === "PASSWORD" && passwordMode === "SAVED" && password
            ? password
            : null,
        options: {
          server_alive_interval: Number(serverAliveInterval) || 0,
          server_alive_count_max: 3,
          compression,
          strict_host_key_checking: strictHostKeyChecking,
          forward_agent: forwardAgent,
          startup_command: startupCommand.trim() || null,
          telemetry_enabled: telemetryEnabled,
          telemetry_interval_sec: clampInterval(telemetryIntervalSec),
          auto_reconnect: autoReconnect,
          reconnect_interval_sec: clampInterval(reconnectIntervalSec),
        },
        port_forwards: forwards.map((pf) => ({
          id: pf.id ?? null,
          label: pf.label,
          forward_type: pf.forward_type,
          bind_address: pf.bind_address,
          bind_port: pf.bind_port,
          target_host: pf.forward_type === "DYNAMIC" ? null : pf.target_host,
          target_port: pf.forward_type === "DYNAMIC" ? null : pf.target_port,
          is_enabled: pf.is_enabled,
        })),
      };

      const savedHost: HostFullConfigDto = editingHost
        ? await hostsApi.hostUpdate({ ...payload, id: editingHost.id } as UpdateHostRequestDto)
        : await hostsApi.hostCreate(payload);

      onSaved(savedHost);
      onClose();
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  const pendingRule =
    pendingDeleteRuleIdx !== null ? forwards[pendingDeleteRuleIdx] : undefined;

  return {
    alias,
    setAlias,
    host,
    setHost,
    port,
    setPort,
    username,
    setUsername,
    groupName,
    setGroupName,
    tagsInput,
    setTagsInput,
    authMethod,
    setAuthMethod,
    passwordMode,
    setPasswordMode,
    password,
    setPassword,
    selectedKeyId,
    privateKeyPath,
    setPrivateKeyPath,
    serverAliveInterval,
    setServerAliveInterval,
    strictHostKeyChecking,
    setStrictHostKeyChecking,
    compression,
    setCompression,
    forwardAgent,
    setForwardAgent,
    startupCommand,
    setStartupCommand,
    telemetryEnabled,
    setTelemetryEnabled,
    telemetryIntervalSec,
    setTelemetryIntervalSec,
    autoReconnect,
    setAutoReconnect,
    reconnectIntervalSec,
    setReconnectIntervalSec,
    forwards,
    pendingRule,
    setPendingDeleteRuleIdx,
    savedKeys,
    isGroupMenuOpen,
    setIsGroupMenuOpen,
    isSaving,
    handleSelectSavedKey,
    handleAddRule,
    handleToggleRule,
    confirmRemoveRule,
    handleSubmit,
  };
}
