import React from "react";
import { AlertTriangle, X } from "lucide-react";
import type { PortProbeResultDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { Button, ModalShell } from "@/shared/ui";

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
    <ModalShell
      isOpen={conflicts.length > 0}
      onClose={onAbort}
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto p-5 space-y-4 text-xs select-none"
    >
      <div data-tauri-drag-region="deep" className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-slate-100">{t("conflict.title")}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onAbort}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {conflicts.map((c) => (
          <div
            key={c.rule_id}
            className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between font-mono"
          >
            <div>
              <span className="text-slate-400">{t("conflict.port")}: </span>
              <span className="text-amber-300 font-semibold">
                {c.bind_address}:{c.bind_port}
              </span>
            </div>
            <div className="text-slate-300">
              {c.conflicting_process_name ?? t("conflict.process")}
              {c.conflicting_pid ? ` (PID ${c.conflicting_pid})` : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
        <Button variant="secondary" onClick={onAbort}>
          {t("conflict.abort")}
        </Button>
        <Button variant="primary" onClick={onSkipAndConnect}>
          {t("conflict.skip_connect")}
        </Button>
      </div>
    </ModalShell>
  );
};
