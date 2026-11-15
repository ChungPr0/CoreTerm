import React from "react";
import { ArrowRight, Download, Folder, Loader2, Upload, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ModalShell } from "@/shared/ui";

export interface PendingTransfer {
  direction: "upload" | "download";
  paths: string[];
  destDir: string;
}

interface TransferConfirmModalProps {
  transfer: PendingTransfer | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

const PREVIEW_LIMIT = 4;

function pathBaseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, "");
  return trimmed.split(/[\\/]/).pop() || p;
}

export const TransferConfirmModal: React.FC<TransferConfirmModalProps> = ({
  transfer,
  busy = false,
  onCancel,
  onConfirm,
}) => {
  const { t } = useI18n();

  const isUpload = transfer?.direction === "upload";
  const count = transfer?.paths.length ?? 0;
  const previewNames = (transfer?.paths ?? []).slice(0, PREVIEW_LIMIT).map(pathBaseName);
  const remaining = count - previewNames.length;

  return (
    <ModalShell
      isOpen={!!transfer}
      onClose={onCancel}
      closeDisabled={busy}
      closeOnBackdrop
      positionClassName="fixed inset-0"
      backdropClassName="bg-black/75"
      containerClassName="select-none items-center justify-center p-4"
      panelClassName="w-full max-w-md rounded-lg border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl"
    >
      {transfer && (
        <form
          role="dialog"
          aria-modal="true"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void onConfirm();
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#21262d] px-4 py-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`mt-0.5 rounded p-1.5 shrink-0 ${
                  isUpload
                    ? "bg-[#1f6feb]/20 text-[#58a6ff]"
                    : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {isUpload ? <Upload className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#e6edf3]">
                  {t(isUpload ? "sftp.confirm_upload_title" : "sftp.confirm_download_title")}
                </h3>
                <p className="mt-0.5 text-xs text-[#8b949e]">
                  {t(isUpload ? "sftp.confirm_upload_desc" : "sftp.confirm_download_desc", {
                    count,
                  })}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded p-1 text-[#8b949e] hover:bg-[#1f242c] hover:text-[#e6edf3] disabled:opacity-50"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-4 text-xs">
            <div className="space-y-1 rounded border border-[#21262d] bg-[#161b22] px-3 py-2 font-mono text-[11px]">
              {previewNames.map((name, idx) => (
                <div key={`${name}-${idx}`} className="truncate text-[#e6edf3]">
                  • {name}
                </div>
              ))}
              {remaining > 0 && (
                <div className="text-[#8b949e]">
                  {t("sftp.confirm_more_items", { count: remaining })}
                </div>
              )}
            </div>

            <div className="rounded border border-[#21262d] bg-[#161b22] px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[#8b949e]">
                <Folder className="h-3.5 w-3.5 text-amber-400" />
                <span>{t("sftp.confirm_dest_label")}</span>
                <ArrowRight className="h-3 w-3 text-[#484f58]" />
              </div>
              <div className="break-all font-mono text-[11px] text-[#e6edf3]">
                {transfer.destDir}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#21262d] px-4 py-3">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#21262d] disabled:opacity-50"
            >
              {t("sftp.modal_cancel")}
            </button>
            <button
              type="submit"
              autoFocus
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
                isUpload
                  ? "bg-[#1f6feb] hover:bg-[#388bfd]"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isUpload ? (
                <Upload className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>
                {t(isUpload ? "sftp.confirm_upload_btn" : "sftp.confirm_download_btn")}
              </span>
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
};
