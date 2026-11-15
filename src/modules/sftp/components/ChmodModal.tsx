import React, { useEffect, useState } from "react";
import { Shield, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ModalShell } from "@/shared/ui";

interface ChmodModalProps {
  isOpen: boolean;
  targetName: string;
  initialMode: number;
  onClose: () => void;
  onConfirm: (mode: number) => Promise<void>;
}

const BIT_ROWS = [
  { labelKey: "sftp.chmod_owner", shift: 6 },
  { labelKey: "sftp.chmod_group", shift: 3 },
  { labelKey: "sftp.chmod_other", shift: 0 },
] as const;

export const ChmodModal: React.FC<ChmodModalProps> = ({
  isOpen,
  targetName,
  initialMode,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<number>(initialMode & 0o7777);
  const [octalText, setOctalText] = useState<string>(
    (initialMode & 0o777).toString(8).padStart(3, "0")
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const masked = initialMode & 0o7777;
    setMode(masked);
    setOctalText(
      masked > 0o777
        ? masked.toString(8).padStart(4, "0")
        : masked.toString(8).padStart(3, "0")
    );
    setSubmitting(false);
  }, [isOpen, initialMode]);

  const toggleBit = (bit: number) => {
    const next = mode ^ bit;
    setMode(next);
    setOctalText(
      next > 0o777
        ? next.toString(8).padStart(4, "0")
        : next.toString(8).padStart(3, "0")
    );
  };

  const handleOctalChange = (val: string) => {
    const cleaned = val.replace(/[^0-7]/g, "").slice(0, 4);
    setOctalText(cleaned);
    if (cleaned.length > 0) {
      const parsed = parseInt(cleaned, 8);
      if (!Number.isNaN(parsed) && parsed <= 0o7777) {
        setMode(parsed);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm(mode);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={submitting}
      positionClassName="fixed inset-0"
      zIndexClass="z-[65]"
      containerClassName="items-center justify-center p-4"
      panelClassName="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-sm p-5 text-xs select-none"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100">{t("sftp.chmod_title")}</h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">{targetName}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/70">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2 px-3 font-medium" />
                <th className="py-2 px-2 text-center font-medium">{t("sftp.chmod_read")}</th>
                <th className="py-2 px-2 text-center font-medium">{t("sftp.chmod_write")}</th>
                <th className="py-2 px-2 text-center font-medium">{t("sftp.chmod_exec")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {BIT_ROWS.map((row) => (
                <tr key={row.labelKey}>
                  <td className="py-2 px-3 text-slate-200 font-medium">{t(row.labelKey)}</td>
                  {[4, 2, 1].map((perm) => {
                    const bit = perm << row.shift;
                    return (
                      <td key={perm} className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={(mode & bit) !== 0}
                          onChange={() => toggleBit(bit)}
                          className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="text-slate-300 font-medium">{t("sftp.chmod_octal")}</label>
          <input
            type="text"
            value={octalText}
            onChange={(e) => handleOctalChange(e.target.value)}
            placeholder="0755"
            className="w-24 h-8 px-2.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-right focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            {t("sftp.modal_cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting || octalText.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold"
          >
            {t("sftp.modal_confirm")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
