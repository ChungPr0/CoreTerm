import React, { useEffect, useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";
import { ModalShell, useAlert } from "@/shared/ui";

interface GroupModalProps {
  isOpen: boolean;
  existingGroups: string[];
  isSubmitting?: boolean;
  onClose: () => void;
  onCreateGroup: (name: string) => Promise<void>;
}

const MAX_GROUP_NAME_LEN = 64;

export const GroupModal: React.FC<GroupModalProps> = ({
  isOpen,
  existingGroups,
  isSubmitting = false,
  onClose,
  onCreateGroup,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      scrollAndFocusInput(inputRef.current);
      return void alert.error(t("group.name_required"));
    }
    if (trimmed.length > MAX_GROUP_NAME_LEN) {
      scrollAndFocusInput(inputRef.current);
      return void alert.error(t("group.name_too_long"));
    }

    const duplicate = existingGroups.some(
      (g) => g.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      scrollAndFocusInput(inputRef.current);
      return void alert.error(t("group.name_duplicate"));
    }

    try {
      await onCreateGroup(trimmed);
    } catch (err) {
      scrollAndFocusInput(inputRef.current);
      alert.error(formatLocalizedError(err, t));
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={isSubmitting}
      closeOnBackdrop
      panelClassName="bg-slate-900 border border-slate-700/80 rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] w-full max-w-sm overflow-hidden flex flex-col text-xs select-none"
    >
      <div
        data-tauri-drag-region="deep"
        className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-2">
          <FolderPlus className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-bold text-slate-100">{t("group.create_title")}</h2>
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

      <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-slate-300 font-medium mb-1.5">
            {t("group.name")} *
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
    </ModalShell>
  );
};
