import React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { PortProbeResultDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { ActionModal } from "@/shared/ui";

interface PortConflictModalProps {
  conflicts: PortProbeResultDto[];
  onSkipAndConnect: () => void;
  onAbort: () => void;
}

export const PortConflictModal: React.FC<PortConflictModalProps> = ({
  conflicts,
  onSkipAndConnect,
  onAbort,
}) => {
  const { t } = useI18n();

  return (
    <ActionModal
      isOpen={conflicts.length > 0}
      onClose={onAbort}
      title={t("conflict.title")}
      icon={<AlertTriangle className="h-4 w-4" />}
      iconTone="warning"
      size="md"
      confirmLabel={t("conflict.skip_connect")}
      confirmVariant="primary"
      confirmIcon={<ArrowRight className="h-3.5 w-3.5" />}
      cancelLabel={t("conflict.abort")}
      onConfirm={onSkipAndConnect}
    >
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {conflicts.map((c) => {
          const processLabel = `${c.conflicting_process_name ?? t("conflict.process")}${
            c.conflicting_pid ? ` (PID ${c.conflicting_pid})` : ""
          }`;
          return (
            <div
              key={c.rule_id}
              className="p-3 rounded border border-[#21262d] bg-[#161b22] flex items-center justify-between gap-3 font-mono text-xs"
            >
              <div className="whitespace-nowrap shrink-0">
                <span className="text-[#8b949e]">{t("conflict.port")}: </span>
                <span className="text-amber-300 font-semibold">
                  {c.bind_address}:{c.bind_port}
                </span>
              </div>
              <div className="text-[#c9d1d9] truncate min-w-0" data-tooltip={processLabel}>
                {processLabel}
              </div>
            </div>
          );
        })}
      </div>
    </ActionModal>
  );
};
