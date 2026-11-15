import React, { useEffect, useState } from "react";
import { RotateCcw, ShieldAlert, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ModalShell, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { sftpApi, type SftpHostKeyPromptEventDto } from "@/modules/sftp";
import { sessionApi } from "../api/sessionApi";
import type { SessionHostKeyPromptEventDto } from "../types";

interface HostKeyPromptModalProps {
  prompt: SessionHostKeyPromptEventDto | SftpHostKeyPromptEventDto | null;
  source: "pty" | "sftp";
  onClose: () => void;
  onReconnectTab: (tabId: string) => void;
}

export const HostKeyPromptModal: React.FC<HostKeyPromptModalProps> = ({
  prompt,
  source,
  onClose,
  onReconnectTab,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubmitting(false);
  }, [prompt]);

  if (!prompt) return null;

  const isChangedWarning = prompt.reason === "HOST_KEY_CHANGED_WARNING";

  const handleDecision = async (
    action: "ACCEPT" | "REJECT" | "REMOVE_OLD_AND_ACCEPT"
  ) => {
    setSubmitting(true);
    try {
      if (source === "sftp") {
        await sftpApi.sftpSubmitHostKey(prompt.tab_id, action);
        onClose();
      } else {
        await sessionApi.sessionSubmitHostKey(prompt.tab_id, action);
        onClose();
        if (action === "REMOVE_OLD_AND_ACCEPT") {
          onReconnectTab(prompt.tab_id);
        }
      }
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (source === "sftp") {
      void handleDecision("REJECT");
      return;
    }
    onClose();
  };

  return (
    <ModalShell
      isOpen
      onClose={handleDismiss}
      closeDisabled={submitting}
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto p-5 space-y-4 text-xs select-none"
    >
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
            {isChangedWarning ? t("hostkey.changed_title") : t("hostkey.title")}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={submitting}
          className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 rounded bg-slate-950 border border-slate-800 font-mono space-y-1.5">
        <div className="flex items-center justify-between text-slate-300">
          <span>
            {prompt.host}:{prompt.port}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
            {prompt.algorithm}
          </span>
        </div>
        <div className="text-sky-400 break-all">{prompt.fingerprint}</div>
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
    </ModalShell>
  );
};
