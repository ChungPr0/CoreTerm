import React from "react";
import { ArrowRight, Download, Folder, Upload } from "lucide-react";
import { SFTP_TRANSFER_PREVIEW_LIMIT } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { ActionModal } from "@/shared/ui";

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
  const previewNames = (transfer?.paths ?? [])
    .slice(0, SFTP_TRANSFER_PREVIEW_LIMIT)
    .map(pathBaseName);
  const remaining = count - previewNames.length;

  return (
    <ActionModal
      isOpen={!!transfer}
      onClose={onCancel}
      busy={busy}
      title={t(isUpload ? "sftp.confirm_upload_title" : "sftp.confirm_download_title")}
      subtitle={t(isUpload ? "sftp.confirm_upload_desc" : "sftp.confirm_download_desc", {
        count,
      })}
      icon={isUpload ? <Upload className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      iconTone={isUpload ? "primary" : "success"}
      size="md"
      confirmLabel={t(isUpload ? "sftp.confirm_upload_btn" : "sftp.confirm_download_btn")}
      confirmVariant={isUpload ? "primary" : "success"}
      confirmIcon={
        isUpload ? (
          <Upload className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )
      }
      cancelLabel={t("sftp.modal_cancel")}
      confirmAutoFocus
      onConfirm={onConfirm}
    >
      {transfer && (
        <>
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
        </>
      )}
    </ActionModal>
  );
};
