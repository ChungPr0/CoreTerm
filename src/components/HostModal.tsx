import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  KeyRound,
  Lock,
  Network,
  Plus,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  AuthMethod,
  CreateHostRequestDto,
  ForwardType,
  PasswordMode,
  SshKeyDto,
  StrictHostKeyChecking,
  UpdateHostRequestDto,
  UpsertPortForwardRequestDto,
  HostFullConfigDto,
} from "../types/ipc";
import { tauriApi } from "../services/tauriApi";
import { useI18n } from "../i18n";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { formatLocalizedError } from "../utils/formatError";

interface HostModalProps {
  isOpen: boolean;
  editingHost: HostFullConfigDto | null;
  initialGroupName?: string;
  existingGroups: string[];
  keysVersion?: number;
  onOpenKeyVault?: () => void;
  onClose: () => void;
  onSaved: (saved: HostFullConfigDto) => void;
}

interface DraftPortForward {
  id?: string;
  label: string;
  forward_type: ForwardType;
  bind_address: string;
  bind_port: number;
  target_host: string;
  target_port: number;
  is_enabled: boolean;
}

export const HostModal: React.FC<HostModalProps> = ({
  isOpen,
  editingHost,
  initialGroupName,
  existingGroups,
  keysVersion = 0,
  onOpenKeyVault,
  onClose,
  onSaved,
}) => {
  const { t } = useI18n();

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
  const [deletedRuleIds, setDeletedRuleIds] = useState<string[]>([]);
  const [pendingDeleteRuleIdx, setPendingDeleteRuleIdx] = useState<number | null>(null);
  const [newPfLabel, setNewPfLabel] = useState("");
  const [newPfType, setNewPfType] = useState<ForwardType>("LOCAL");
  const [newPfBindAddr, setNewPfBindAddr] = useState("127.0.0.1");
  const [newPfBindPort, setNewPfBindPort] = useState<number>(8080);
  const [newPfTargetHost, setNewPfTargetHost] = useState("localhost");
  const [newPfTargetPort, setNewPfTargetPort] = useState<number>(80);

  const [savedKeys, setSavedKeys] = useState<SshKeyDto[]>([]);
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState<boolean>(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const keyPathInputRef = useRef<HTMLInputElement>(null);
  const prevKeysVersionRef = useRef<number>(keysVersion);
  const authStateRef = useRef({ authMethod, selectedKeyId, privateKeyPath });
  authStateRef.current = { authMethod, selectedKeyId, privateKeyPath };
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isGroupMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        groupDropdownRef.current &&
        !groupDropdownRef.current.contains(e.target as Node)
      ) {
        setIsGroupMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isGroupMenuOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setDeletedRuleIds([]);
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
    } else {
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

      // Auto-select Default Key when opening Create Host modal
      tauriApi
        .keyGetDefault()
        .then((defKey) => {
          if (defKey) {
            setAuthMethod("SSH_KEY");
            setSelectedKeyId(defKey.id);
            setPrivateKeyPath(defKey.private_key_path);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, editingHost, initialGroupName]);

  useEffect(() => {
    if (!isOpen) {
      prevKeysVersionRef.current = keysVersion;
      return;
    }
    const keysUpdatedWhileOpen = prevKeysVersionRef.current !== keysVersion;
    prevKeysVersionRef.current = keysVersion;

    tauriApi
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
            list.find((k) => k.is_default) ??
            (list.length === 1 ? list[0] : undefined);
          if (defKey) {
            setSelectedKeyId(defKey.id);
            setPrivateKeyPath(defKey.private_key_path);
          }
        }
      })
      .catch(() => {});
  }, [isOpen, keysVersion]);

  if (!isOpen) return null;

  const handleSelectSavedKey = (keyId: string) => {
    setSelectedKeyId(keyId);
    if (!keyId) {
      setPrivateKeyPath("");
      setTimeout(() => keyPathInputRef.current?.focus(), 0);
      return;
    }
    const found = savedKeys.find((k) => k.id === keyId);
    if (found) {
      setPrivateKeyPath(found.private_key_path);
    }
  };

  const handleAddForwardRule = () => {
    setErrorMsg(null);
    const bindPortNum = Number(newPfBindPort);
    if (!Number.isInteger(bindPortNum) || bindPortNum < 1 || bindPortNum > 65535) {
      setErrorMsg(t("errors.forward_port_range"));
      return;
    }
    const targetHost = newPfTargetHost.trim();
    const targetPortNum = Number(newPfTargetPort);
    if (
      newPfType !== "DYNAMIC" &&
      (!targetHost ||
        !Number.isInteger(targetPortNum) ||
        targetPortNum < 1 ||
        targetPortNum > 65535)
    ) {
      setErrorMsg(t("errors.forward_target_required"));
      return;
    }

    setForwards((prev) => [
      ...prev,
      {
        label: newPfLabel.trim() || `${newPfType} ${bindPortNum}`,
        forward_type: newPfType,
        bind_address: newPfBindAddr.trim() || "127.0.0.1",
        bind_port: bindPortNum,
        target_host: targetHost || "localhost",
        target_port: targetPortNum || 80,
        is_enabled: true,
      },
    ]);
    setNewPfLabel("");
  };

  const handleToggleRule = async (idx: number) => {
    const target = forwards[idx];
    const nextState = !target.is_enabled;
    setForwards((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, is_enabled: nextState } : item
      )
    );
    if (target.id) {
      await tauriApi.portForwardToggle(target.id, nextState).catch(() => {});
    }
  };

  const handleRemoveRule = (idx: number) => {
    const target = forwards[idx];
    if (target.id) {
      setDeletedRuleIds((prev) => [...prev, target.id!]);
    }
    setForwards((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanAlias = alias.trim();
    const cleanHost = host.trim();
    const cleanUsername = username.trim();
    const portNum = Number(port);

    if (!cleanAlias) {
      setErrorMsg(t("errors.host_alias_empty"));
      return;
    }
    if (!cleanHost) {
      setErrorMsg(t("errors.host_host_empty"));
      return;
    }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setErrorMsg(t("errors.host_port_range"));
      return;
    }
    if (!cleanUsername) {
      setErrorMsg(t("errors.host_username_empty"));
      return;
    }
    if (authMethod === "SSH_KEY" && !selectedKeyId && !privateKeyPath.trim()) {
      setErrorMsg(t("errors.key_binding_required"));
      return;
    }

    setIsSaving(true);

    try {
      const parsedTags = tagsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: CreateHostRequestDto = {
        alias: cleanAlias,
        host: cleanHost,
        port: portNum,
        username: cleanUsername,
        group_name: groupName.trim() || "Default",
        tags: parsedTags,
        auth_method: authMethod,
        ssh_key_id:
          authMethod === "SSH_KEY" && selectedKeyId ? selectedKeyId : null,
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
          telemetry_interval_sec: Math.min(
            Math.max(Number(telemetryIntervalSec) || 2, 1),
            60
          ),
          auto_reconnect: autoReconnect,
          reconnect_interval_sec: Math.min(
            Math.max(Number(reconnectIntervalSec) || 2, 1),
            60
          ),
        },
      };

      let savedHost: HostFullConfigDto;
      if (editingHost) {
        const updatePayload: UpdateHostRequestDto = {
          ...payload,
          id: editingHost.id,
        };
        savedHost = await tauriApi.hostUpdate(updatePayload);
      } else {
        savedHost = await tauriApi.hostCreate(payload);
      }

      for (const delId of deletedRuleIds) {
        await tauriApi.portForwardDelete(delId);
      }

      for (const pf of forwards) {
        const upsertReq: UpsertPortForwardRequestDto = {
          id: pf.id,
          host_id: savedHost.id,
          label: pf.label,
          forward_type: pf.forward_type,
          bind_address: pf.bind_address,
          bind_port: pf.bind_port,
          target_host: pf.forward_type === "DYNAMIC" ? null : pf.target_host,
          target_port: pf.forward_type === "DYNAMIC" ? null : pf.target_port,
          is_enabled: pf.is_enabled,
        };
        await tauriApi.portForwardUpsert(upsertReq);
      }

      onSaved(savedHost);
      onClose();
    } catch (err) {
      setErrorMsg(formatLocalizedError(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRemoveRule = () => {
    if (pendingDeleteRuleIdx === null) return;
    handleRemoveRule(pendingDeleteRuleIdx);
    setPendingDeleteRuleIdx(null);
  };

  const pendingRule =
    pendingDeleteRuleIdx !== null ? forwards[pendingDeleteRuleIdx] : undefined;

  return (
    <>
      <div
        data-modal-root="true"
        className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      >
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-full select-none">
        <div
          data-tauri-drag-region="deep"
          className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">
              {editingHost ? t("host.edit") : t("host.create")}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto text-xs"
        >
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.alias")} *
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
                required
              />
            </div>

            <div ref={groupDropdownRef} className="relative">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.group")}
              </label>
              <div className="flex items-center h-8 rounded-lg bg-slate-950 border border-slate-800 focus-within:border-sky-500/70 transition-colors">
                <input
                  type="text"
                  value={groupName}
                  maxLength={64}
                  placeholder={t("host.group_placeholder")}
                  onFocus={() => setIsGroupMenuOpen(true)}
                  onClick={() => setIsGroupMenuOpen(true)}
                  onChange={(e) => {
                    setGroupName(e.target.value);
                    if (!isGroupMenuOpen) setIsGroupMenuOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && isGroupMenuOpen) {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsGroupMenuOpen(false);
                    } else if (e.key === "Enter" && isGroupMenuOpen) {
                      e.preventDefault();
                      setIsGroupMenuOpen(false);
                    } else if (e.key === "ArrowDown") {
                      setIsGroupMenuOpen(true);
                    } else if (e.key === "Tab") {
                      setIsGroupMenuOpen(false);
                    }
                  }}
                  className="flex-1 min-w-0 h-full px-3 bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setIsGroupMenuOpen((prev) => !prev)}
                  className="h-full px-2 flex items-center justify-center text-slate-400 hover:text-slate-200 shrink-0 transition-colors"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      isGroupMenuOpen ? "rotate-180 text-sky-400" : ""
                    }`}
                  />
                </button>
              </div>

              {isGroupMenuOpen && existingGroups.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg bg-slate-900 border border-slate-700/90 shadow-2xl py-1 max-h-48 overflow-y-auto select-none">
                  {existingGroups.map((g) => {
                    const isSelected =
                      g.trim().toLowerCase() === groupName.trim().toLowerCase();
                    return (
                      <button
                        key={g}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setGroupName(g);
                          setIsGroupMenuOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                          isSelected
                            ? "bg-sky-500/15 text-sky-300 font-medium"
                            : "text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        <span className="truncate">{g}</span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.tags")}
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.host")} *
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.port")}
              </label>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
                required
              />
            </div>

            <div className="col-span-4">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.username")} *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              {t("host.auth")}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAuthMethod("PASSWORD")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-semibold transition-all ${
                  authMethod === "PASSWORD"
                    ? "bg-sky-500/15 border-sky-500 text-sky-300"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{t("host.auth_password")}</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthMethod("SSH_KEY")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-semibold transition-all ${
                  authMethod === "SSH_KEY"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t("host.auth_key")}</span>
              </button>
            </div>
          </div>

          {authMethod === "PASSWORD" ? (
            <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {t("host.password_mode")}
                </label>
                <select
                  value={passwordMode}
                  onChange={(e) =>
                    setPasswordMode(e.target.value as PasswordMode)
                  }
                  className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
                >
                  <option value="SAVED">{t("host.password_saved")}</option>
                  <option value="PROMPT_EVERY_TIME">
                    {t("host.password_prompt")}
                  </option>
                </select>
              </div>

              {passwordMode === "SAVED" && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    {t("host.password_input")}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      editingHost?.has_saved_password
                        ? t("host.password_kept")
                        : ""
                    }
                    className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2.5">
              <div>
                <label className="block text-slate-400 mb-1">
                  {t("host.select_key")}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedKeyId}
                    onChange={(e) => handleSelectSavedKey(e.target.value)}
                    className="flex-1 min-w-0 h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
                  >
                    <option value="">{t("host.custom_key_path")}</option>
                    {savedKeys.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name} ({k.key_type})
                        {k.is_default ? ` [${t("vault.default")}]` : ""}
                      </option>
                    ))}
                  </select>

                  {onOpenKeyVault && (
                    <button
                      type="button"
                      onClick={onOpenKeyVault}
                      title={t("vault.title")}
                      className="h-8 px-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{t("host.open_vault")}</span>
                    </button>
                  )}
                </div>
              </div>

              {selectedKeyId === "" && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    {t("host.key_path")} *
                  </label>
                  <input
                    ref={keyPathInputRef}
                    type="text"
                    value={privateKeyPath}
                    onChange={(e) => setPrivateKeyPath(e.target.value)}
                    required={authMethod === "SSH_KEY" && selectedKeyId === ""}
                    className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* Visual SSH Options Builder */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>{t("ssh.title")}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {t("ssh.keepalive")}
                </label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={serverAliveInterval}
                  onChange={(e) =>
                    setServerAliveInterval(Number(e.target.value))
                  }
                  className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {t("ssh.host_checking")}
                </label>
                <select
                  value={strictHostKeyChecking}
                  onChange={(e) =>
                    setStrictHostKeyChecking(
                      e.target.value as StrictHostKeyChecking
                    )
                  }
                  className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100"
                >
                  <option value="ACCEPT_NEW">{t("ssh.accept_new")}</option>
                  <option value="YES">{t("ssh.strict_yes")}</option>
                  <option value="NO">{t("ssh.strict_no")}</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {t("ssh.startup_cmd")}
                </label>
                <input
                  type="text"
                  value={startupCommand}
                  onChange={(e) => setStartupCommand(e.target.value)}
                  className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={compression}
                  onChange={(e) => setCompression(e.target.checked)}
                />
                <span>{t("ssh.compression")}</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={forwardAgent}
                  onChange={(e) => setForwardAgent(e.target.checked)}
                />
                <span>{t("ssh.forward_agent")}</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900/60 border border-slate-800">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                  <input
                    type="checkbox"
                    checked={telemetryEnabled}
                    onChange={(e) => setTelemetryEnabled(e.target.checked)}
                  />
                  <span>{t("telemetry.enabled")}</span>
                </label>

                {telemetryEnabled && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">
                      {t("telemetry.interval")}:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={telemetryIntervalSec}
                      onChange={(e) =>
                        setTelemetryIntervalSec(Number(e.target.value))
                      }
                      className="w-14 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-100 font-mono text-right"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900/60 border border-slate-800">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                  <input
                    type="checkbox"
                    checked={autoReconnect}
                    onChange={(e) => setAutoReconnect(e.target.checked)}
                  />
                  <span>{t("session.auto_reconnect")}</span>
                </label>

                {autoReconnect && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">
                      {t("session.reconnect_interval")}:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={reconnectIntervalSec}
                      onChange={(e) =>
                        setReconnectIntervalSec(Number(e.target.value))
                      }
                      className="w-14 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-100 font-mono text-right"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Port Forwarding Manager */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
              <Network className="w-4 h-4 text-emerald-400" />
              <span>{t("forward.title")}</span>
            </div>

            <div className="space-y-2.5">
              <div className="grid grid-cols-12 gap-2.5 items-end">
                <div className="col-span-5">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                    {t("forward.label")}
                  </label>
                  <input
                    type="text"
                    value={newPfLabel}
                    onChange={(e) => setNewPfLabel(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100"
                  />
                </div>

                <div className="col-span-4">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                    {t("forward.type")}
                  </label>
                  <select
                    value={newPfType}
                    onChange={(e) => setNewPfType(e.target.value as ForwardType)}
                    className="w-full h-8 px-2 rounded-md bg-slate-900 border border-slate-800 text-slate-100"
                  >
                    <option value="LOCAL">{t("forward.local")}</option>
                    <option value="REMOTE">{t("forward.remote")}</option>
                    <option value="DYNAMIC">{t("forward.dynamic")}</option>
                  </select>
                </div>

                <div className="col-span-3">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                    {t("forward.bind_addr")}
                  </label>
                  <input
                    type="text"
                    value={newPfBindAddr}
                    onChange={(e) => setNewPfBindAddr(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2.5 items-end">
                <div
                  className={
                    newPfType === "DYNAMIC" ? "col-span-3" : "col-span-2"
                  }
                >
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                    {t("forward.bind_port")}
                  </label>
                  <input
                    type="number"
                    value={newPfBindPort}
                    onChange={(e) => setNewPfBindPort(Number(e.target.value))}
                    className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                  />
                </div>

                {newPfType !== "DYNAMIC" && (
                  <>
                    <div className="col-span-5">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                        {t("forward.target_host")}
                      </label>
                      <input
                        type="text"
                        value={newPfTargetHost}
                        onChange={(e) => setNewPfTargetHost(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                        {t("forward.target_port")}
                      </label>
                      <input
                        type="number"
                        value={newPfTargetPort}
                        onChange={(e) =>
                          setNewPfTargetPort(Number(e.target.value))
                        }
                        className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                      />
                    </div>
                  </>
                )}

                <div
                  className={
                    newPfType === "DYNAMIC"
                      ? "col-span-3 col-start-10"
                      : "col-span-3"
                  }
                >
                  <button
                    type="button"
                    onClick={handleAddForwardRule}
                    className="w-full h-8 flex items-center justify-center gap-1.5 px-3 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("forward.add")}</span>
                  </button>
                </div>
              </div>
            </div>

            {forwards.length > 0 && (
              <div className="space-y-1 pt-1">
                {forwards.map((pf, idx) => (
                  <div
                    key={pf.id ?? idx}
                    className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <input
                        type="checkbox"
                        checked={pf.is_enabled}
                        onChange={() => handleToggleRule(idx)}
                        title={t("forward.enabled")}
                      />
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 text-[10px]">
                        {pf.forward_type}
                      </span>
                      <span className="text-slate-200 font-sans font-medium">
                        {pf.label}
                      </span>
                      <span className="text-slate-400">
                        {pf.bind_address}:{pf.bind_port}
                        {pf.forward_type !== "DYNAMIC"
                          ? ` → ${pf.target_host}:${pf.target_port}`
                          : ""}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPendingDeleteRuleIdx(idx)}
                      title={t("common.delete")}
                      className="p-1 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? t("common.loading") : t("common.save")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

      <ConfirmDeleteModal
        isOpen={!!pendingRule}
        title={t("forward.delete_confirm")}
        itemName={pendingRule ? `${pendingRule.label} (${pendingRule.forward_type})` : ""}
        itemDetail={
          pendingRule
            ? `${pendingRule.bind_address}:${pendingRule.bind_port}${
                pendingRule.forward_type !== "DYNAMIC"
                  ? ` -> ${pendingRule.target_host}:${pendingRule.target_port}`
                  : ""
              }`
            : undefined
        }
        onCancel={() => setPendingDeleteRuleIdx(null)}
        onConfirm={confirmRemoveRule}
      />
    </>
  );
};
