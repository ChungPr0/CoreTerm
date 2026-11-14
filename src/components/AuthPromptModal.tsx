import React, { useEffect, useState } from "react";
import { AlertCircle, KeyRound, RotateCcw, ShieldAlert, X } from "lucide-react";
import {
  SessionAuthPromptEventDto,
  SessionHostKeyPromptEventDto,
} from "../types/ipc";
import { tauriApi } from "../services/tauriApi";
import { useI18n } from "../i18n";
import { formatLocalizedError } from "../utils/formatError";

interface AuthPromptModalProps {
  authPrompt: SessionAuthPromptEventDto | null;
  hostKeyPrompt: SessionHostKeyPromptEventDto | null;
  onCloseAuth: () => void;
  onCloseHostKey: () => void;
  onReconnectTab: (tabId: string) => void;
}

export const AuthPromptModal: React.FC<AuthPromptModalProps> = ({
  authPrompt,
  hostKeyPrompt,
  onCloseAuth,
  onCloseHostKey,
  onReconnectTab,
}) => {
  const { t } = useI18n();
  const [secret, setSecret] = useState("");
  const [saveVault, setSaveVault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setSubmitting(false);
    setSecret("");
    setSaveVault(false);
  }, [authPrompt, hostKeyPrompt]);

  if (hostKeyPrompt) {
    const isChangedWarning =
      hostKeyPrompt.reason === "HOST_KEY_CHANGED_WARNING";

    const handleDecision = async (
      action: "ACCEPT" | "REJECT" | "REMOVE_OLD_AND_ACCEPT"
    ) => {
      setErrorMsg(null);
      setSubmitting(true);
      try {
        await tauriApi.sessionSubmitHostKey(hostKeyPrompt.tab_id, action);
        onCloseHostKey();
        if (action === "REMOVE_OLD_AND_ACCEPT") {
          onReconnectTab(hostKeyPrompt.tab_id);
        }
      } catch (err) {
        setErrorMsg(formatLocalizedError(err, t));
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div
        data-modal-root="true"
        className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      >
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto p-5 space-y-4 text-xs select-none">
          <div
            data-tauri-drag-region="deep"
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert
                className={`w-4 h-4 ${
                  isChangedWarning ? "text-rose-400" : "text-amber-400"
                }`}
              />
              <h3 className="text-sm font-bold text-slate-100">
                {isChangedWarning
                  ? t("hostkey.changed_title")
                  : t("hostkey.title")}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCloseHostKey}
              disabled={submitting}
              className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded bg-slate-950 border border-slate-800 font-mono space-y-1.5">
            <div className="flex items-center justify-between text-slate-300">
              <span>
                {hostKeyPrompt.host}:{hostKeyPrompt.port}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                {hostKeyPrompt.algorithm}
              </span>
            </div>
            <div className="text-sky-400 break-all">
              {hostKeyPrompt.fingerprint}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleDecision("REJECT")}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium"
            >
              {t("hostkey.reject")}
            </button>

            {isChangedWarning ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDecision("REMOVE_OLD_AND_ACCEPT")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t("hostkey.reset")}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDecision("ACCEPT")}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold"
              >
                {t("hostkey.accept")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!authPrompt) return null;

  const handleSubmitSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await tauriApi.sessionSubmitSecret(authPrompt.tab_id, secret, saveVault);
      setSecret("");
      setSaveVault(false);
      onCloseAuth();
    } catch (err) {
      setErrorMsg(formatLocalizedError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-modal-root="true"
      className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <form
        onSubmit={handleSubmitSecret}
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-sm max-h-full overflow-y-auto p-5 space-y-4 text-xs select-none"
      >
        <div
          data-tauri-drag-region="deep"
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-slate-100">
              {authPrompt.prompt_type === "KEY_PASSPHRASE"
                ? t("auth.title_passphrase")
                : t("auth.title_password")}
            </h3>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onCloseAuth}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-slate-400 mb-1">{t("auth.secret")}</label>
          <input
            type="password"
            autoFocus
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
            required
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
            onClick={onCloseAuth}
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
    </div>
  );
};
