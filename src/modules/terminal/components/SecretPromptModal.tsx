import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Checkbox, IconButton, Input, Switch, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { useTabsStore } from "@/modules/workspace";
import { sftpApi, type SftpAuthPromptEventDto } from "@/modules/sftp";
import { sessionApi } from "../api/sessionApi";
import type { SessionAuthPromptEventDto } from "../types";

interface SecretPromptModalProps {
  prompt: SessionAuthPromptEventDto | SftpAuthPromptEventDto | null;
  source: "pty" | "sftp";
  onClose: () => void;
  onAbortTab?: (tabId: string, source: "pty" | "sftp") => void;
  onCancelAutoReconnect?: (tabId: string) => void;
}

export const SecretPromptModal: React.FC<SecretPromptModalProps> = ({
  prompt,
  source,
  onClose,
  onAbortTab,
  onCancelAutoReconnect,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [secret, setSecret] = useState("");
  const [saveVault, setSaveVault] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAlertKeyRef = useRef<string | null>(null);
  const alertRef = useRef(alert);
  const tRef = useRef(t);
  alertRef.current = alert;
  tRef.current = t;

  useEffect(() => {
    if (!prompt) {
      lastAlertKeyRef.current = null;
      return;
    }
    setSubmitting(false);
    setSecret("");
    setSaveVault(false);
    setAutoReconnect(false);
    setShowSecret(false);
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());

    if (prompt.attempt > 1) {
      const alertKey = `${prompt.tab_id}:${source}:${prompt.attempt}:${prompt.prompt_type}`;
      if (lastAlertKeyRef.current !== alertKey) {
        lastAlertKeyRef.current = alertKey;
        alertRef.current.error(
          tRef.current(
            prompt.prompt_type === "KEY_PASSPHRASE"
              ? "auth.invalid_passphrase_retry"
              : "auth.invalid_password_retry"
          )
        );
      }
    }

    return () => window.cancelAnimationFrame(raf);
  }, [prompt, source]);

  if (!prompt) return null;

  const handleSubmit = async () => {
    if (!secret) return void alert.error(t("auth.secret_required"));
    setSubmitting(true);
    try {
      if (source === "sftp") {
        await sftpApi.sftpSubmitSecret(prompt.tab_id, secret, saveVault, autoReconnect);
      } else {
        await sessionApi.sessionSubmitSecret(prompt.tab_id, secret, saveVault, autoReconnect);
      }
      if (saveVault) {
        useTabsStore.setState((s) => ({
          tabs: s.tabs.map((tab) =>
            tab.tabId === prompt.tab_id
              ? {
                  ...tab,
                  canAutoReconnect: true,
                  autoReconnect: autoReconnect,
                }
              : tab
          ),
        }));
      }
      setSecret("");
      setSaveVault(false);
      setAutoReconnect(false);
      onClose();
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    onCancelAutoReconnect?.(prompt.tab_id);
    if (onAbortTab) {
      onAbortTab(prompt.tab_id, source);
    } else if (source === "sftp") {
      void sftpApi.sftpDisconnect(prompt.tab_id).catch(() => {});
    } else {
      void sessionApi.sessionWriteStdin(prompt.tab_id, [3]).catch(() => {});
    }
    onClose();
  };

  return (
    <ActionModal
      isOpen
      onClose={handleDismiss}
      busy={submitting}
      title={
        prompt.prompt_type === "KEY_PASSPHRASE"
          ? t("auth.title_passphrase")
          : t("auth.title_password")
      }
      subtitle={prompt.prompt_text || undefined}
      icon={<KeyRound className="h-4 w-4" />}
      iconTone="primary"
      size="sm"
      confirmLabel={t("auth.submit")}
      confirmVariant="primary"
      confirmIcon={<KeyRound className="h-3.5 w-3.5" />}
      cancelLabel={t("common.cancel")}
      onConfirm={handleSubmit}
    >
      <div className="rounded border border-[#21262d] bg-[#161b22] p-3.5 space-y-3">
        <Input
          ref={inputRef}
          type={showSecret ? "text" : "password"}
          autoFocus
          label={t("auth.secret")}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          rightIcon={
            <IconButton
              size="xs"
              tabIndex={-1}
              onClick={() => setShowSecret((v) => !v)}
              icon={showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            />
          }
        />

        <div className="flex items-center gap-4 h-6 pt-1">
          <Checkbox
            checked={saveVault}
            onCheckedChange={(checked) => {
              setSaveVault(checked);
              if (!checked) setAutoReconnect(false);
            }}
            label={t("auth.save_vault")}
          />

          <div
            className={`flex items-center transition-opacity duration-150 ${
              saveVault ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <Switch
              disabled={!saveVault}
              checked={autoReconnect && saveVault}
              onChange={(checked) => setAutoReconnect(checked)}
              label={t("session.auto_reconnect")}
            />
          </div>
        </div>
      </div>
    </ActionModal>
  );
};
