import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ModalShell, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";

interface NameModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (value: string) => Promise<void>;
}

export const NameModal: React.FC<NameModalProps> = ({
  isOpen,
  title,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!trimmed) return void alert.error(t("sftp.name_required"));
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
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      closeDisabled={saving}
      closeOnBackdrop
      positionClassName="fixed inset-0"
      backdropClassName="bg-black/75"
      containerClassName="select-none items-center justify-center p-4"
      panelClassName="w-full max-w-sm rounded-lg border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl"
    >
      <div role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-[#21262d] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#e6edf3]">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded p-1 text-[#8b949e] hover:bg-[#1f242c] hover:text-[#e6edf3] disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-3 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#8b949e]">{label}</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              className="w-full rounded border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-sm text-[#e6edf3] outline-none focus:border-[#388bfd]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#21262d] disabled:opacity-50"
            >
              {t("sftp.modal_cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded border border-[#1f6feb] bg-[#1f6feb] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#388bfd] disabled:opacity-50"
            >
              {saving ? "..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
};
