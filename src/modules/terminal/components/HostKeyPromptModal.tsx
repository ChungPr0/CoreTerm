import React, { useEffect, useState } from "react";
import { Check, RotateCcw, ShieldAlert } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Button, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { sftpApi, type SftpHostKeyPromptEventDto } from "@/modules/sftp";
import { sessionApi } from "../api/sessionApi";
import type { SessionHostKeyPromptEventDto } from "../types";

interface HostKeyPromptModalProps {
  prompt: SessionHostKeyPromptEventDto | SftpHostKeyPromptEventDto | null;
  source: "pty" | "sftp";
  onClose: () => void;
  onAbortTab?: (tabId: string, source: "pty" | "sftp") => void;
  onReconnectTab: (tabId: string) => void;
  onCancelAutoReconnect?: (tabId: string) => void;
}

export const HostKeyPromptModal: React.FC<HostKeyPromptModalProps> = ({
  prompt,
  source,
  onClose,
  onAbortTab,
  onReconnectTab,
  onCancelAutoReconnect,
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
      if (action === "REJECT") {
        await (source === "sftp"
          ? sftpApi.sftpSubmitHostKey(prompt.tab_id, action)
          : sessionApi.sessionSubmitHostKey(prompt.tab_id, action)
        ).catch(() => {});
        onCancelAutoReconnect?.(prompt.tab_id);
        onAbortTab?.(prompt.tab_id, source);
        onClose();
        return;
      }

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
    void handleDecision("REJECT");
  };

  return (
    <ActionModal
      isOpen
      onClose={handleDismiss}
      busy={submitting}
      title={isChangedWarning ? t("hostkey.changed_title") : t("hostkey.title")}
      icon={<ShieldAlert className="h-4 w-4" />}
      iconTone={isChangedWarning ? "danger" : "warning"}
      size="md"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={submitting}
            onClick={() => handleDecision("REJECT")}
          >
            {t("hostkey.reject")}
          </Button>

          {isChangedWarning ? (
            <Button
              variant="danger"
              size="sm"
              disabled={submitting}
              loading={submitting}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => handleDecision("REMOVE_OLD_AND_ACCEPT")}
            >
              {t("hostkey.reset")}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={submitting}
              loading={submitting}
              leftIcon={<Check className="w-3.5 h-3.5" />}
              onClick={() => handleDecision("ACCEPT")}
            >
              {t("hostkey.accept")}
            </Button>
          )}
        </>
      }
    >
      <div className="p-3.5 rounded border border-[#21262d] bg-[#161b22] font-mono space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-[#c9d1d9]">
          <span>
            {prompt.host}:{prompt.port}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[#21262d] text-[10px] text-[#8b949e]">
            {prompt.algorithm}
          </span>
        </div>
        <div className="text-[#58a6ff] break-all">{prompt.fingerprint}</div>
      </div>
    </ActionModal>
  );
};
