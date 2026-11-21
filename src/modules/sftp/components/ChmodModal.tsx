import React, { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Checkbox, Input, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import {
  cleanOctalInput,
  modeToOctal,
  octalToMode,
  toggleModeBit,
} from "../utils/chmodHelpers";

interface ChmodModalProps {
  isOpen: boolean;
  targetName: string;
  initialMode: number;
  busy?: boolean;
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
  busy = false,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [mode, setMode] = useState<number>(initialMode & 0o7777);
  const [octalText, setOctalText] = useState<string>(modeToOctal(initialMode));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const sanitized = initialMode & 0o7777;
      setMode(sanitized);
      setOctalText(modeToOctal(sanitized));
      setSubmitting(false);
    }
  }, [isOpen, initialMode]);

  const toggleBit = (bit: number) => {
    const next = toggleModeBit(mode, bit);
    setMode(next);
    setOctalText(modeToOctal(next));
  };

  const handleOctalChange = (text: string) => {
    const sanitized = cleanOctalInput(text);
    setOctalText(sanitized);
    const parsed = octalToMode(sanitized);
    if (parsed !== null) {
      setMode(parsed);
    }
  };

  const handleSubmit = async () => {
    if (submitting || busy) return;
    setSubmitting(true);
    try {
      await onConfirm(mode);
      onClose();
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      busy={submitting || busy}
      title={t("sftp.chmod_title")}
      subtitle={targetName}
      icon={<Shield className="h-4 w-4" />}
      iconTone="primary"
      size="sm"
      confirmLabel={t("sftp.modal_confirm")}
      confirmVariant="primary"
      confirmIcon={<Shield className="h-3.5 w-3.5" />}
      confirmDisabled={submitting || busy || octalText.length === 0}
      cancelLabel={t("sftp.modal_cancel")}
      onConfirm={handleSubmit}
    >
      <div className="border border-[#21262d] rounded-lg overflow-hidden bg-[#161b22]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#21262d] text-[11px] text-[#8b949e]">
              <th className="py-2 px-3 font-medium" />
              <th className="py-2 px-2 text-center font-medium whitespace-nowrap">{t("sftp.chmod_read")}</th>
              <th className="py-2 px-2 text-center font-medium whitespace-nowrap">{t("sftp.chmod_write")}</th>
              <th className="py-2 px-2 text-center font-medium whitespace-nowrap">{t("sftp.chmod_exec")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262d]">
            {BIT_ROWS.map((row) => (
              <tr key={row.labelKey}>
                <td className="py-2 px-3 text-[#e6edf3] font-medium whitespace-nowrap">{t(row.labelKey)}</td>
                {[4, 2, 1].map((perm) => {
                  const bit = perm << row.shift;
                  return (
                    <td key={perm} className="py-2 px-2 text-center">
                      <Checkbox
                        size="sm"
                        checked={(mode & bit) !== 0}
                        onCheckedChange={() => toggleBit(bit)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 rounded border border-[#21262d] bg-[#161b22] px-3 py-2">
        <label className="text-[#8b949e] text-[11px] font-medium whitespace-nowrap">
          {t("sftp.chmod_octal")}
        </label>
        <Input
          type="text"
          value={octalText}
          onChange={(e) => handleOctalChange(e.target.value)}
          placeholder="0755"
          maxLength={4}
          className="font-mono text-center tracking-wider h-7 text-xs bg-[#0d1117] border-[#30363d] text-[#e6edf3]"
          containerClassName="w-24 shrink-0"
        />
      </div>
    </ActionModal>
  );
};
