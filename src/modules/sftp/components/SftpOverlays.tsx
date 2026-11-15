import React from "react";
import { Download, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { SftpDragPreview } from "../hooks/useSftpFileDrag";
import type { FileItem, SftpTransferConflictEventDto } from "../types";
import { ChmodModal } from "./ChmodModal";
import { ConflictModal, type ConflictAction } from "./ConflictModal";
import { NameModal } from "./NameModal";
import { TransferConfirmModal, type PendingTransfer } from "./TransferConfirmModal";

export type NamePromptState =
  | { kind: "mkdir"; targetKind: "local" | "remote" }
  | { kind: "rename"; targetKind: "local" | "remote"; item: FileItem };

interface SftpOverlaysProps {
  pendingTransfer: PendingTransfer | null;
  transferBusy: boolean;
  onCancelTransfer: () => void;
  onConfirmTransfer: () => Promise<void>;
  activeConflict: SftpTransferConflictEventDto | null;
  onResolveConflict: (action: ConflictAction, applyAll: boolean) => void;
  nameModal: NamePromptState | null;
  onCancelNameModal: () => void;
  onSubmitNameModal: (value: string) => Promise<void>;
  chmodItem: FileItem | null;
  onCloseChmod: () => void;
  onConfirmChmod: (nextMode: number) => Promise<void>;
  dragPreview: SftpDragPreview | null;
}

export const SftpOverlays: React.FC<SftpOverlaysProps> = ({
  pendingTransfer,
  transferBusy,
  onCancelTransfer,
  onConfirmTransfer,
  activeConflict,
  onResolveConflict,
  nameModal,
  onCancelNameModal,
  onSubmitNameModal,
  chmodItem,
  onCloseChmod,
  onConfirmChmod,
  dragPreview,
}) => {
  const { t } = useI18n();

  return (
    <>
      <TransferConfirmModal
        transfer={pendingTransfer}
        busy={transferBusy}
        onCancel={onCancelTransfer}
        onConfirm={onConfirmTransfer}
      />

      <ConflictModal conflict={activeConflict} onResolve={onResolveConflict} />

      <NameModal
        isOpen={nameModal !== null}
        title={
          nameModal?.kind === "rename"
            ? t("sftp.modal_rename_title")
            : t("sftp.modal_new_folder_title")
        }
        label={
          nameModal?.kind === "rename"
            ? t("sftp.modal_rename_label")
            : t("sftp.modal_new_folder_label")
        }
        initialValue={nameModal?.kind === "rename" ? nameModal.item.name : ""}
        confirmLabel={t("sftp.modal_confirm")}
        onCancel={onCancelNameModal}
        onSubmit={onSubmitNameModal}
      />

      <ChmodModal
        isOpen={chmodItem !== null}
        targetName={chmodItem?.name ?? ""}
        initialMode={chmodItem?.mode ?? 0o644}
        onClose={onCloseChmod}
        onConfirm={onConfirmChmod}
      />

      {dragPreview && (
        <div
          style={{
            left: Math.min(dragPreview.clientX + 14, window.innerWidth - 250),
            top: Math.max(8, Math.min(dragPreview.clientY + 14, window.innerHeight - 44)),
          }}
          className="pointer-events-none fixed z-[120] flex max-w-[240px] select-none items-center gap-2 rounded-lg border border-[#388bfd]/70 bg-[#0d1117]/95 px-2.5 py-1.5 text-xs text-[#e6edf3] shadow-[0_12px_30px_rgba(0,0,0,0.75)]"
        >
          {dragPreview.fromKind === "local" ? (
            <Upload className="h-3.5 w-3.5 shrink-0 text-[#58a6ff]" />
          ) : (
            <Download className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
          <span className="truncate font-medium">
            {dragPreview.count > 1
              ? t("sftp.selected_count", { count: dragPreview.count })
              : dragPreview.label}
          </span>
          {dragPreview.targetKind && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                dragPreview.targetKind === "remote"
                  ? "bg-[#1f6feb]/25 text-[#58a6ff]"
                  : "bg-emerald-500/20 text-emerald-300"
              }`}
            >
              {dragPreview.targetKind === "remote"
                ? t("sftp.confirm_upload_btn")
                : t("sftp.confirm_download_btn")}
            </span>
          )}
        </div>
      )}
    </>
  );
};
