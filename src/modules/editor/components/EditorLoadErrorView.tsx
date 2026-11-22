import React from "react";
import { AlertCircle, RefreshCw, RotateCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui";

interface EditorLoadErrorViewProps {
  loadError: string;
  loadErrDisconnected: boolean;
  connecting: boolean;
  onForceClose: () => void;
  onReconnectAndReload: () => void;
  onRetryLoad: () => void;
}

export const EditorLoadErrorView: React.FC<EditorLoadErrorViewProps> = ({
  loadError,
  loadErrDisconnected,
  connecting,
  onForceClose,
  onReconnectAndReload,
  onRetryLoad,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 items-center justify-center p-4 bg-ct-app/85 select-none">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl space-y-3.5 text-xs">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">{t("editor.load_err_title")}</h3>
            <p className="text-[11px] font-mono text-rose-300 break-words">{loadError}</p>
            <p className="text-slate-400 leading-relaxed">
              {loadErrDisconnected ? t("editor.load_err_sftp_desc") : t("editor.load_err_desc")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onForceClose}>
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
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={onRetryLoad}
            >
              {t("editor.retry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
