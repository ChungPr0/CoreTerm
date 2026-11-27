import React, { useState } from "react";
import { ArrowUpCircle, Download, ExternalLink, RotateCw } from "lucide-react";
import { UPDATER_RELEASES_LATEST_URL } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { ActionModal, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { fmtSize } from "@/shared/utils/formatters";
import { windowApi } from "@/modules/workspace/api/windowApi";
import { useUpdaterStore } from "../hooks/useUpdaterStore";

interface UpdateModalProps {
  onRequestRestartAndInstall: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  onRequestRestartAndInstall,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const isOpen = useUpdaterStore((s) => s.isModalOpen);
  const closeModal = useUpdaterStore((s) => s.closeModal);
  const phase = useUpdaterStore((s) => s.phase);
  const latest = useUpdaterStore((s) => s.latest);
  const progress = useUpdaterStore((s) => s.progress);
  const downloadUpdate = useUpdaterStore((s) => s.downloadUpdate);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !latest?.available || !latest.version) {
    return null;
  }

  const isPortable = !latest.can_install_in_app;
  const isMsi = latest.install_kind === "msi";
  const isDownloading = phase === "downloading" || submitting;
  const isReady = phase === "ready" || latest.is_downloaded;

  const handleConfirm = async () => {
    if (isPortable) {
      const targetUrl = latest.release_url || UPDATER_RELEASES_LATEST_URL;
      closeModal();
      await windowApi.windowOpenUrl(targetUrl).catch((err) => {
        alert.error(formatLocalizedError(err, t));
      });
      return;
    }

    if (isReady) {
      closeModal();
      onRequestRestartAndInstall();
      return;
    }

    setSubmitting(true);
    try {
      const ok = await downloadUpdate();
      if (ok) {
        closeModal();
        onRequestRestartAndInstall();
      }
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmLabel = isPortable
    ? t("updater.download_release_btn")
    : isReady
      ? t("updater.restart_to_update_btn")
      : t("updater.update_now_btn");

  const confirmIcon = isPortable ? (
    <ExternalLink className="h-3.5 w-3.5" />
  ) : isReady ? (
    <RotateCw className="h-3.5 w-3.5" />
  ) : (
    <Download className="h-3.5 w-3.5" />
  );

  const pct = Math.min(100, Math.max(0, progress?.percent ?? 0));

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={closeModal}
      busy={isDownloading}
      title={t("updater.modal_title")}
      subtitle={t("updater.modal_subtitle", {
        current: latest.current_version,
        latest: latest.version,
      })}
      icon={<ArrowUpCircle className="h-4 w-4" />}
      iconTone={isReady ? "success" : "primary"}
      size="md"
      cancelLabel={t("updater.later_btn")}
      confirmLabel={confirmLabel}
      confirmVariant="primary"
      confirmIcon={confirmIcon}
      confirmAutoFocus
      onConfirm={handleConfirm}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>{t("updater.release_notes")}</span>
            {latest.asset_size ? (
              <span className="font-mono text-[10px] text-slate-500">
                {fmtSize(latest.asset_size)}
              </span>
            ) : null}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300 select-text">
            {latest.release_notes ||
              t("updater.no_release_notes", { version: latest.version })}
          </div>
        </div>

        {phase === "downloading" && (
          <div className="space-y-1.5 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5">
            <div className="flex items-center justify-between text-[11px] text-sky-300">
              <span>{t("updater.downloading_label")}</span>
              <span className="font-mono">
                {progress && progress.total_bytes > 0
                  ? `${fmtSize(progress.downloaded_bytes)} / ${fmtSize(progress.total_bytes)} (${pct}%)`
                  : `${pct}%`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                style={{ width: `${pct}%` }}
                className="h-full rounded-full bg-sky-400 transition-[width] duration-150"
              />
            </div>
          </div>
        )}

        {isPortable && (
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t("updater.portable_hint")}
          </p>
        )}

        {!isPortable && isMsi && (
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t("updater.msi_hint")}
          </p>
        )}
      </div>
    </ActionModal>
  );
};
