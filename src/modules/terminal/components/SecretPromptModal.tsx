import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ModalShell, useAlert } from "@/shared/ui";
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
          <button
            type="button"
            disabled={submitting}
            onClick={handleDismiss}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {prompt.prompt_text && (
          <p className="text-[11px] font-mono text-slate-400 break-all">
            {prompt.prompt_text}
          </p>
        )}

        <div>
          <label className="block text-slate-400 mb-1">{t("auth.secret")}</label>
          <div className="relative">
            <input
              ref={inputRef}
              type={showSecret ? "text" : "password"}
              autoFocus
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full pl-3 pr-9 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {showSecret ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 h-6">
          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300 select-none">
            <input
              type="checkbox"
              checked={saveVault}
              onChange={(e) => {
                const checked = e.target.checked;
                setSaveVault(checked);
                if (!checked) setAutoReconnect(false);
              }}
            />
            <span>{t("auth.save_vault")}</span>
          </label>

          <div
            className={`flex items-center transition-opacity duration-150 ${
              saveVault ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                disabled={!saveVault}
                checked={autoReconnect && saveVault}
                onChange={(e) => setAutoReconnect(e.target.checked)}
              />
              <span>{t("session.auto_reconnect")}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={handleDismiss}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold"
          >
            {t("auth.submit")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
