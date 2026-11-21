import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Button, Checkbox } from "@/shared/ui";
import { fmtSize, fmtTime } from "@/shared/utils/formatters";
import type { SftpTransferConflictEventDto } from "../types";

export type ConflictAction = "OVERWRITE" | "SKIP" | "RENAME" | "RESUME";

interface ConflictModalProps {
  conflict: SftpTransferConflictEventDto | null;
  onResolve: (action: ConflictAction, applyToAll: boolean) => void;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({ conflict, onResolve }) => {
  const { t } = useI18n();
  const [applyAll, setApplyAll] = useState(false);

  useEffect(() => {
    setApplyAll(false);
  }, [conflict?.conflict_id]);

  return (
    <ActionModal
      isOpen={!!conflict}
      onClose={() => {}}
      closeOnBackdrop={false}
      closeOnEscape={false}
      showCloseButton={false}
      title={t("sftp.conflict_title")}
      subtitle={conflict ? t("sftp.conflict_subtitle", { name: conflict.file_name }) : undefined}
      icon={<AlertTriangle className="h-4 w-4" />}
      iconTone="warning"
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onResolve("SKIP", applyAll)}
          >
            {t("sftp.conflict_skip")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve("RENAME", applyAll)}
          >
            {t("sftp.conflict_rename")}
          </Button>
          {conflict?.can_resume && (
            <Button
              variant="success"
              size="sm"
              onClick={() => onResolve("RESUME", applyAll)}
            >
              {t("sftp.conflict_resume")}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => onResolve("OVERWRITE", applyAll)}
          >
            {t("sftp.conflict_overwrite")}
          </Button>
        </div>
      }
    >
      {conflict && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded border border-[#21262d] bg-[#161b22] p-2.5">
              <div className="font-semibold text-[#58a6ff]">{t("sftp.conflict_source")}</div>
              <div
                className="mt-1 truncate font-mono text-[11px] text-[#8b949e]"
                title={conflict.source_path}
              >
                {conflict.source_path}
              </div>
              <div className="mt-1.5 text-[#c9d1d9]">{fmtSize(conflict.source_size)}</div>
              <div className="text-[11px] text-[#8b949e]">
                {fmtTime(conflict.source_mtime_ms)}
              </div>
            </div>

            <div className="rounded border border-[#21262d] bg-[#161b22] p-2.5">
              <div className="font-semibold text-amber-400">{t("sftp.conflict_dest")}</div>
              <div
                className="mt-1 truncate font-mono text-[11px] text-[#8b949e]"
                title={conflict.dest_path}
              >
                {conflict.dest_path}
              </div>
              <div className="mt-1.5 text-[#c9d1d9]">{fmtSize(conflict.dest_size)}</div>
              <div className="text-[11px] text-[#8b949e]">{fmtTime(conflict.dest_mtime_ms)}</div>
            </div>
          </div>

          <Checkbox
            checked={applyAll}
            onCheckedChange={setApplyAll}
            label={t("sftp.conflict_apply_all")}
            containerClassName="pt-1 text-[#c9d1d9]"
          />
        </div>
      )}
    </ActionModal>
  );
};
