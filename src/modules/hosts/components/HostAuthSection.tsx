import React, { useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import type { AuthMethod, PasswordMode } from "../types";
import type { SshKeyDto } from "@/modules/keys";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton, Input, SegmentedControl, Select, Switch } from "@/shared/ui";

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
        <SegmentedControl<AuthMethod>
          value={authMethod}
          onChange={onAuthMethodChange}
          options={[
            {
              value: "PASSWORD",
              label: t("host.auth_password"),
              icon: <Lock className="w-3.5 h-3.5" />,
            },
            {
              value: "SSH_KEY",
              label: t("host.auth_key"),
              icon: <KeyRound className="w-3.5 h-3.5" />,
            },
          ]}
        />
      </div>

      {authMethod === "PASSWORD" ? (
        <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 grid grid-cols-2 gap-3">
          <Select
            label={t("host.password_mode")}
            value={passwordMode}
            onChange={(e) => onPasswordModeChange(e.target.value as PasswordMode)}
          >
            <option value="SAVED">{t("host.password_saved")}</option>
            <option value="PROMPT_EVERY_TIME">{t("host.password_prompt")}</option>
          </Select>

          <Input
            ref={passwordInputRef}
            type={showPassword ? "text" : "password"}
            label={
              passwordMode === "SAVED" && !hasSavedPassword
                ? `${t("host.password_input")} *`
                : t("host.password_input")
            }
            value={password}
            disabled={passwordMode !== "SAVED"}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={
              passwordMode === "SAVED"
                ? (hasSavedPassword ? t("host.password_kept") : "")
                : t("host.password_prompt")
            }
            rightIcon={
              <IconButton
                size="xs"
                tabIndex={-1}
                disabled={passwordMode !== "SAVED"}
                onClick={() => setShowPassword((v) => !v)}
                icon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              />
            }
          />

          {passwordMode === "SAVED" && onAutoReconnectChange && (
            <div className="col-span-2 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <div className="flex items-center h-7 shrink-0 whitespace-nowrap">
                <Switch
                  checked={autoReconnect}
                  onChange={onAutoReconnectChange}
                  label={t("session.auto_reconnect")}
                />
              </div>

              {autoReconnect && onReconnectIntervalSecChange && (
                <div className="flex items-center gap-2 h-7 shrink-0">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                    {t("session.reconnect_interval")}:
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={reconnectIntervalSec}
                    onChange={(e) => onReconnectIntervalSecChange(Number(e.target.value))}
                    inputSize="sm"
                    containerClassName="w-20 shrink-0"
                    className="font-mono text-right"
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
              <Select
                value={selectedKeyId}
                onChange={(e) => handleSelectKey(e.target.value)}
                containerClassName="flex-1 min-w-0"
              >
                <option value="">{t("host.custom_key_path")}</option>
                {savedKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.key_type})
                    {k.is_default ? ` [${t("vault.default")}]` : ""}
                  </option>
                ))}
              </Select>

              {onOpenKeyVault && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={onOpenKeyVault}
                  title={t("vault.title")}
                  leftIcon={<KeyRound className="w-3.5 h-3.5 text-emerald-400" />}
                  className="text-emerald-400 hover:text-emerald-300 border-slate-700/80"
                >
                  {t("host.open_vault")}
                </Button>
              )}
            </div>
          </div>

          <Input
            ref={effectiveKeyPathRef}
            type="text"
            label={`${t("host.key_path")} *`}
            value={
              selectedKeyId === ""
                ? privateKeyPath
                : (savedKeys.find((k) => k.id === selectedKeyId)?.private_key_path ?? t("vault.default"))
            }
            disabled={selectedKeyId !== ""}
            onChange={(e) => onPrivateKeyPathChange(e.target.value)}
            className="font-mono"
          />

          {onAutoReconnectChange && (
            <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <div className="flex items-center h-7 shrink-0 whitespace-nowrap">
                <Switch
                  checked={autoReconnect}
                  onChange={onAutoReconnectChange}
                  label={t("session.auto_reconnect")}
                />
              </div>

              {autoReconnect && onReconnectIntervalSecChange && (
                <div className="flex items-center gap-2 h-7 shrink-0">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                    {t("session.reconnect_interval")}:
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={reconnectIntervalSec}
                    onChange={(e) => onReconnectIntervalSecChange(Number(e.target.value))}
                    inputSize="sm"
                    containerClassName="w-20 shrink-0"
                    className="font-mono text-right"
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
