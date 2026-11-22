import React from "react";
import { AlertCircle, RefreshCw, RotateCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Button } from "@/shared/ui";

interface EditorLoadErrorViewProps {
  loadError: string;
  loadErrDisconnected: boolean;
  connecting: boolean;
  retrying?: boolean;
  onForceClose: () => void;
  onReconnectAndReload: () => void;
  onRetryLoad: () => void;
}

export const EditorLoadErrorView: React.FC<EditorLoadErrorViewProps> = ({
  loadError,
  loadErrDisconnected,
  connecting,
  retrying = false,
  onForceClose,
  onReconnectAndReload,
  onRetryLoad,
}) => {
  const { t } = useI18n();

  return (
    <ActionModal
      isOpen={true}
      onClose={onForceClose}
      busy={connecting || retrying}
      title={t("editor.load_err_title")}
      icon={<AlertCircle className="h-4 w-4" />}
      iconTone="danger"
      size="sm"
      closeOnBackdrop={false}
      closeOnEscape={true}
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={connecting || retrying}
            onClick={onForceClose}
          >
            {t("common.close")}
          </Button>
          {loadErrDisconnected ? (
            <Button
              variant="primary"
              size="sm"
              loading={connecting}
              leftIcon={<RotateCw className="w-3.5 h-3.5" />}
              onClick={onReconnectAndReload}
            >
              {t("editor.reconnect_and_reload")}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              loading={retrying}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={onRetryLoad}
            >
              {t("editor.retry")}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-1.5 leading-relaxed">
        <p className="text-xs font-medium text-rose-300 break-words">{loadError}</p>
        <p className="text-xs text-slate-400">
          {loadErrDisconnected ? t("editor.load_err_sftp_desc") : t("editor.load_err_desc")}
        </p>
      </div>
    </ActionModal>
  );
};
