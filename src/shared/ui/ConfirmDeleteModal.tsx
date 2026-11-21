import React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal } from "./ActionModal";
import { Checkbox } from "./Checkbox";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  itemName: string;
  itemDetail?: string;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  checkboxDisabled?: boolean;
  checkboxDisabledHint?: string;
  onCheckboxChange?: (checked: boolean) => void;
  note?: string;
  noteTone?: "danger" | "neutral";
  confirmLabel?: string;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  itemName,
  itemDetail,
  checkboxLabel,
  checkboxChecked = false,
  checkboxDisabled = false,
  checkboxDisabledHint,
  onCheckboxChange,
  note,
  noteTone = "neutral",
  confirmLabel,
  isDeleting = false,
  onCancel,
  onConfirm,
}) => {
  const { t } = useI18n();

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onCancel}
      busy={isDeleting}
      title={title}
      subtitle={t("common.delete_confirm_title")}
      icon={<Trash2 className="h-4 w-4" />}
      iconTone="danger"
      size="md"
      confirmLabel={confirmLabel ?? t("common.delete")}
      confirmVariant="danger"
      confirmIcon={<Trash2 className="h-3.5 w-3.5" />}
      cancelLabel={t("common.cancel")}
      confirmAutoFocus
      onConfirm={onConfirm}
    >
      <div className="rounded border border-[#21262d] bg-[#161b22] px-3.5 py-3 space-y-1">
        <div className="font-semibold text-[#e6edf3] break-words">{itemName}</div>
        {itemDetail && (
          <div className="text-[11px] text-[#8b949e] font-mono break-all">{itemDetail}</div>
        )}
      </div>

      {checkboxLabel && (
        <label
          className={`flex items-center justify-between gap-2 p-2.5 rounded border text-xs select-none transition-colors ${
            checkboxDisabled
              ? "bg-[#161b22]/50 border-[#21262d] text-[#484f58] cursor-not-allowed"
              : checkboxChecked
              ? "bg-rose-950/30 border-rose-500/40 text-rose-200 cursor-pointer"
              : "bg-[#161b22] border-[#21262d] text-[#c9d1d9] hover:border-[#30363d] cursor-pointer"
          }`}
        >
          <Checkbox
            tone="rose"
            disabled={checkboxDisabled || isDeleting}
            checked={checkboxChecked}
            onCheckedChange={onCheckboxChange}
            label={checkboxLabel}
          />
          {checkboxDisabled && checkboxDisabledHint && (
            <span className="text-[10px] text-amber-300/90 font-mono">
              {checkboxDisabledHint}
            </span>
          )}
        </label>
      )}

      {note && (
        <div
          className={`p-2.5 rounded border flex items-start gap-2 text-[11px] ${
            noteTone === "danger"
              ? "bg-rose-950/40 border-rose-800/60 text-rose-200"
              : "bg-amber-950/30 border-amber-800/40 text-amber-200"
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              noteTone === "danger" ? "text-rose-400" : "text-amber-400"
            }`}
          />
          <span className="leading-snug">{note}</span>
        </div>
      )}
    </ActionModal>
  );
};
