import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, Checkbox, IconButton, Input, ModalShell, Switch, useAlert } from "@/shared/ui";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <ModalShell
      isOpen
      onClose={handleDismiss}
      closeDisabled={submitting}
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-sm max-h-full overflow-y-auto text-xs select-none"
    >
      <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4">
        <div
          data-tauri-drag-region="deep"
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-slate-100">
              {prompt.prompt_type === "KEY_PASSPHRASE"
                ? t("auth.title_passphrase")
                : t("auth.title_password")}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={submitting}
            onClick={handleDismiss}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {prompt.prompt_text && (
          <p className="text-[11px] font-mono text-slate-400 break-all">
            {prompt.prompt_text}
          </p>
        )}

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

        <div className="flex items-center gap-4 h-6">
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

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={handleDismiss}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={submitting}
          >
            {t("auth.submit")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
