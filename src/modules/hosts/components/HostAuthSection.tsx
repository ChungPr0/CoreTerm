import React, { useRef } from "react";
import { KeyRound, Lock } from "lucide-react";
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
  hasSavedPassword?: boolean;
  savedKeys: SshKeyDto[];
  selectedKeyId: string;
  onSelectSavedKey: (keyId: string) => void;
  privateKeyPath: string;
  onPrivateKeyPathChange: (val: string) => void;
  onOpenKeyVault?: () => void;
}

export const HostAuthSection: React.FC<HostAuthSectionProps> = ({
  authMethod,
  onAuthMethodChange,
  passwordMode,
  onPasswordModeChange,
  password,
  onPasswordChange,
  hasSavedPassword,
  savedKeys,
  selectedKeyId,
  onSelectSavedKey,
  privateKeyPath,
  onPrivateKeyPathChange,
  onOpenKeyVault,
}) => {
  const { t } = useI18n();
  const keyPathInputRef = useRef<HTMLInputElement>(null);

  const handleSelectKey = (keyId: string) => {
    onSelectSavedKey(keyId);
    if (!keyId) {
      setTimeout(() => keyPathInputRef.current?.focus(), 0);
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

          {passwordMode === "SAVED" && (
            <div>
              <label className="block text-slate-400 mb-1">
                {t("host.password_input")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={hasSavedPassword ? t("host.password_kept") : ""}
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

          {selectedKeyId === "" && (
            <div>
              <label className="block text-slate-400 mb-1">
                {t("host.key_path")} *
              </label>
              <input
                ref={keyPathInputRef}
                type="text"
                value={privateKeyPath}
                onChange={(e) => onPrivateKeyPathChange(e.target.value)}
                required={authMethod === "SSH_KEY" && selectedKeyId === ""}
                className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};
