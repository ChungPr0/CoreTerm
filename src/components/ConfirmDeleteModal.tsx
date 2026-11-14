import React, { useEffect } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n";

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
  errorMessage?: string | null;
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
  errorMessage,
  confirmLabel,
  isDeleting = false,
  onCancel,
  onConfirm,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      data-modal-root="true"
      onClick={() => {
        if (!isDeleting) onCancel();
      }}
      className="absolute inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] w-full max-w-md max-h-full overflow-y-auto text-xs select-none"
      >
        <div className="h-1 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500" />

        <div className="p-5 space-y-4">
          <div
            data-tauri-drag-region="deep"
            className="flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                  {t("common.delete_confirm_title")}
                </div>
                <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                  {title}
                </h3>
              </div>
            </div>

            <button
              type="button"
              disabled={isDeleting}
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-1">
            <div className="font-semibold text-slate-100 break-words">
              {itemName}
            </div>
            {itemDetail && (
              <div className="text-[11px] text-slate-400 font-mono break-all">
                {itemDetail}
              </div>
            )}
          </div>

          {checkboxLabel && (
            <label
              className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs select-none transition-colors ${
                checkboxDisabled
                  ? "bg-slate-950/50 border-slate-800/70 text-slate-500 cursor-not-allowed"
                  : checkboxChecked
                  ? "bg-rose-950/45 border-rose-500/50 text-rose-200 cursor-pointer"
                  : "bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-700 cursor-pointer"
              }`}
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  disabled={checkboxDisabled || isDeleting}
                  checked={checkboxChecked}
                  onChange={(e) => onCheckboxChange?.(e.target.checked)}
                  className="accent-rose-500"
                />
                <span>{checkboxLabel}</span>
              </span>
              {checkboxDisabled && checkboxDisabledHint && (
                <span className="text-[10px] text-amber-300/90">
                  {checkboxDisabledHint}
                </span>
              )}
            </label>
          )}

          {note && (
            <div
              className={`p-2.5 rounded-lg border flex items-start gap-2 text-[11px] ${
                noteTone === "danger"
                  ? "bg-rose-950/60 border-rose-800/80 text-rose-200"
                  : "bg-slate-950/60 border-slate-800 text-slate-300"
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  noteTone === "danger" ? "text-rose-400" : "text-amber-400"
                }`}
              />
              <span>{note}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-[11px]">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={isDeleting}
              onClick={onCancel}
              autoFocus
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void onConfirm()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-70"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>{confirmLabel ?? t("common.delete")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
