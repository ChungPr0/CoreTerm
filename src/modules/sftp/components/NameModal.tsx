import React, { useEffect, useRef, useState } from "react";
import { Edit3, FilePlus, FolderPlus } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Input, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";

interface NameModalProps {
  isOpen: boolean;
  kind?: "mkdir" | "rename" | "newfile";
  title: string;
  subTitle?: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (value: string) => Promise<void>;
}

export const NameModal: React.FC<NameModalProps> = ({
  isOpen,
  kind = "mkdir",
  title,
  subTitle,
  label,
  initialValue,
  confirmLabel,
  onCancel,
  onSubmit,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    setSaving(false);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [isOpen, initialValue]);

  const trimmed = value.trim();
  const isRename = kind === "rename";
  const isNewFile = kind === "newfile";
  const modalIcon = isNewFile ? (
    <FilePlus className="h-4 w-4" />
  ) : isRename ? (
    <Edit3 className="h-4 w-4" />
  ) : (
    <FolderPlus className="h-4 w-4" />
  );
  const confirmBtnIcon = isNewFile ? (
    <FilePlus className="h-3.5 w-3.5" />
  ) : isRename ? (
    <Edit3 className="h-3.5 w-3.5" />
  ) : (
    <FolderPlus className="h-3.5 w-3.5" />
  );

  const handleSubmit = async () => {
    if (saving) return;
    if (!trimmed) return void alert.error(t("sftp.name_required"));
    if (trimmed === "." || trimmed === "..") {
      return void alert.error(t("errors.sftp_entry_name_invalid", { name: trimmed }));
    }
    if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
      return void alert.error(t("errors.sftp_entry_name_separators", { name: trimmed }));
    }
    setSaving(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onCancel}
      busy={saving}
      title={title}
      subtitle={subTitle}
      icon={modalIcon}
      iconTone={isRename ? "warning" : "primary"}
      size="md"
      confirmLabel={confirmLabel}
      confirmVariant="primary"
      confirmIcon={confirmBtnIcon}
      confirmDisabled={saving || !trimmed}
      cancelLabel={t("sftp.modal_cancel")}
      onConfirm={handleSubmit}
    >
      <div className="rounded border border-[#21262d] bg-[#161b22] px-3.5 py-3">
        <label className="block text-[11px] font-medium text-[#8b949e] mb-1.5">
          {`${label} *`}
        </label>
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
        />
      </div>
    </ActionModal>
  );
};
