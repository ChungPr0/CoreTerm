import React, { useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import type { AuthMethod, PasswordMode } from "../types";
import type { SshKeyDto } from "@/modules/keys";
import { useI18n } from "@/shared/i18n";

interface HostAuthSectionProps {
  authMethod: AuthMethod;
  onAuthMethodChange: (method: AuthMethod) => void;
  passwordMode: PasswordMode;
  onPasswordModeChange: (mode: PasswordMode) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  passwordInputRef?: React.RefObject<HTMLInputElement>;
  keyPathInputRef?: React.RefObject<HTMLInputElement>;
  hasSavedPassword?: boolean;
  savedKeys: SshKeyDto[];
  selectedKeyId: string;
  onSelectSavedKey: (keyId: string) => void;
  privateKeyPath: string;
  onPrivateKeyPathChange: (val: string) => void;
  onOpenKeyVault?: () => void;
  autoReconnect?: boolean;
  onAutoReconnectChange?: (val: boolean) => void;
  reconnectIntervalSec?: number;
  onReconnectIntervalSecChange?: (val: number) => void;
}

export const HostAuthSection: React.FC<HostAuthSectionProps> = ({
  authMethod,
  onAuthMethodChange,
  passwordMode,
  onPasswordModeChange,
  password,
  onPasswordChange,
  passwordInputRef,
  keyPathInputRef,
  hasSavedPassword,
  savedKeys,
  selectedKeyId,
  onSelectSavedKey,
  privateKeyPath,
  onPrivateKeyPathChange,
  onOpenKeyVault,
  autoReconnect = false,
  onAutoReconnectChange,
  reconnectIntervalSec = 2,
  onReconnectIntervalSecChange,
}) => {
  const { t } = useI18n();
  const localKeyPathRef = useRef<HTMLInputElement>(null);
  const effectiveKeyPathRef = keyPathInputRef || localKeyPathRef;
  const [showPassword, setShowPassword] = useState(false);

  const handleSelectKey = (keyId: string) => {
    onSelectSavedKey(keyId);
    if (!keyId) {
      setTimeout(() => effectiveKeyPathRef.current?.focus(), 0);
    }
  };

  return (
    <>
      <div>
        <label className="block text-slate-300 font-medium mb-1">
          {t("host.auth")}
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onAuthMethodChange("PASSWORD")}
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
            onClick={() => onAuthMethodChange("SSH_KEY")}
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
              onChange={(e) => onPasswordModeChange(e.target.value as PasswordMode)}
              className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
            >
              <option value="SAVED">{t("host.password_saved")}</option>
              <option value="PROMPT_EVERY_TIME">{t("host.password_prompt")}</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">
              {t("host.password_input")}
            </label>
            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={passwordMode !== "SAVED"}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={
                  passwordMode === "SAVED"
                    ? (hasSavedPassword ? t("host.password_kept") : "")
                    : t("host.password_prompt")
                }
                className={`w-full h-8 pl-3 pr-9 rounded bg-slate-900 border border-slate-800 text-slate-100 ${
                  passwordMode !== "SAVED" ? "opacity-40 cursor-not-allowed bg-slate-950" : ""
                }`}
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={passwordMode !== "SAVED"}
                onClick={() => setShowPassword((v) => !v)}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors ${
                  passwordMode !== "SAVED" ? "opacity-30 pointer-events-none" : ""
                }`}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {passwordMode === "SAVED" && onAutoReconnectChange && (
            <div className="col-span-2 pt-2 border-t border-slate-800/80 h-8 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 select-none">
                <input
                  type="checkbox"
                  checked={autoReconnect}
                  onChange={(e) => onAutoReconnectChange(e.target.checked)}
                />
                <span>{t("session.auto_reconnect")}</span>
              </label>

              {autoReconnect && onReconnectIntervalSecChange && (
                <div className="flex items-center gap-1.5 h-7">
                  <span className="text-[11px] text-slate-400">
                    {t("session.reconnect_interval")}:
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={reconnectIntervalSec}
                    onChange={(e) => onReconnectIntervalSecChange(Number(e.target.value))}
                    className="w-14 h-7 px-2 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono text-right"
                  />
                </div>
              )}
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
                onChange={(e) => handleSelectKey(e.target.value)}
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

          <div>
            <label className="block text-slate-400 mb-1">
              {t("host.key_path")} *
            </label>
            <input
              ref={effectiveKeyPathRef}
              type="text"
              value={
                selectedKeyId === ""
                  ? privateKeyPath
                  : (savedKeys.find((k) => k.id === selectedKeyId)?.private_key_path ?? t("vault.default"))
              }
              disabled={selectedKeyId !== ""}
              onChange={(e) => onPrivateKeyPathChange(e.target.value)}
              className={`w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono ${
                selectedKeyId !== "" ? "opacity-50 cursor-not-allowed bg-slate-950" : ""
              }`}
            />
          </div>

          {onAutoReconnectChange && (
            <div className="pt-2 border-t border-slate-800/80 h-8 flex items-center justify-between">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 select-none">
                <input
                  type="checkbox"
                  checked={autoReconnect}
                  onChange={(e) => onAutoReconnectChange(e.target.checked)}
                />
                <span>{t("session.auto_reconnect")}</span>
              </label>

              {autoReconnect && onReconnectIntervalSecChange && (
                <div className="flex items-center gap-1.5 h-7">
                  <span className="text-[11px] text-slate-400">
                    {t("session.reconnect_interval")}:
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={reconnectIntervalSec}
                    onChange={(e) => onReconnectIntervalSecChange(Number(e.target.value))}
                    className="w-14 h-7 px-2 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono text-right"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
