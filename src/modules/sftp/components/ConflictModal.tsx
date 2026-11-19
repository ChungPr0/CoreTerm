import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, Checkbox, ModalShell } from "@/shared/ui";
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
    <ModalShell
      isOpen={!!conflict}
      closeOnBackdrop={false}
      closeOnEscape={false}
      positionClassName="fixed inset-0"
      backdropClassName="bg-black/75"
      containerClassName="select-none items-center justify-center p-4"
      panelClassName="w-full max-w-md rounded-lg border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl"
    >
      {conflict && (
        <div role="dialog" aria-modal="true">
          <div className="flex items-start gap-3 border-b border-[#21262d] px-4 py-3">
            <div className="mt-0.5 rounded bg-amber-500/15 p-1.5 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#e6edf3]">
                {t("sftp.conflict_title")}
              </h3>
              <p className="mt-0.5 break-all text-xs text-[#8b949e]">
                {t("sftp.conflict_subtitle", { name: conflict.file_name })}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 p-4 text-xs">
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

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#21262d] px-4 py-3">
            <Button
              variant="secondary"
              onClick={() => onResolve("SKIP", applyAll)}
            >
              {t("sftp.conflict_skip")}
            </Button>
            <Button
              variant="outline"
              onClick={() => onResolve("RENAME", applyAll)}
            >
              {t("sftp.conflict_rename")}
            </Button>
            {conflict.can_resume && (
              <Button
                variant="success"
                onClick={() => onResolve("RESUME", applyAll)}
              >
                {t("sftp.conflict_resume")}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => onResolve("OVERWRITE", applyAll)}
            >
              {t("sftp.conflict_overwrite")}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
};
