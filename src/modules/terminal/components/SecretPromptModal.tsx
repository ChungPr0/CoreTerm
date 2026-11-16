import React, { useEffect, useRef, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ModalShell, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
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
        await sftpApi.sftpSubmitSecret(prompt.tab_id, secret, saveVault);
      } else {
        await sessionApi.sessionSubmitSecret(prompt.tab_id, secret, saveVault);
      }
      setSecret("");
      setSaveVault(false);
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
          <input
            ref={inputRef}
            type="password"
            autoFocus
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
          />
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={saveVault}
            onChange={(e) => setSaveVault(e.target.checked)}
          />
          <span>{t("auth.save_vault")}</span>
        </label>

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
