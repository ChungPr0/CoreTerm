import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, FolderPlus, X } from "lucide-react";
import { useI18n } from "../i18n";
import { formatLocalizedError } from "../utils/formatError";

interface GroupModalProps {
  isOpen: boolean;
  existingGroups: string[];
  isSubmitting?: boolean;
  onClose: () => void;
  onCreateGroup: (name: string) => Promise<void>;
}

const MAX_GROUP_NAME_LEN = 64;

/** Modal dialog for creating a persistent sidebar connection group. */
export const GroupModal: React.FC<GroupModalProps> = ({
  isOpen,
  existingGroups,
  isSubmitting = false,
  onClose,
  onCreateGroup,
}) => {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setErrorMsg(null);
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg(t("group.name_required"));
      return;
    }
    if (trimmed.length > MAX_GROUP_NAME_LEN) {
      setErrorMsg(t("group.name_too_long"));
      return;
    }
    const duplicate = existingGroups.some(
      (g) => g.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setErrorMsg(t("group.name_duplicate"));
      return;
    }

    setErrorMsg(null);
    try {
      await onCreateGroup(trimmed);
    } catch (err) {
      setErrorMsg(formatLocalizedError(err, t));
    }
  };

  return (
    <div
      data-modal-root="true"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] w-full max-w-sm overflow-hidden flex flex-col text-xs select-none"
      >
        <div
          data-tauri-drag-region="deep"
          className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">
              {t("group.create_title")}
            </h2>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-45"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              {t("group.name")} *
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={t("group.name_placeholder")}
              maxLength={MAX_GROUP_NAME_LEN}
              disabled={isSubmitting}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/70"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium disabled:opacity-45 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? t("common.loading") : t("common.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
