import React, { useEffect, useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";
import { Button, Input, ModalShell, useAlert } from "@/shared/ui";

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

        <Button
          variant="ghost"
          size="icon"
          disabled={isSubmitting}
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4">
        <Input
          ref={inputRef}
          type="text"
          label={`${t("group.name")} *`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("group.name_placeholder")}
          maxLength={MAX_GROUP_NAME_LEN}
          disabled={isSubmitting}
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="secondary"
            disabled={isSubmitting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={isSubmitting}
          >
            {t("common.add")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
