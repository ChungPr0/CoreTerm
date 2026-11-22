import React from "react";
import { RefreshCw, Terminal as TerminalIcon } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { ShellProfile } from "@/shared/types/ipc";
import { Button, Select } from "@/shared/ui";

interface DefaultShellSectionProps {
  availableShells: ShellProfile[];
  effectiveDefaultShellId: string;
  isScanning: boolean;
  onChangeDefaultShellId: (id: string) => void;
  onRescan: () => void;
}

export const DefaultShellSection: React.FC<DefaultShellSectionProps> = ({
  availableShells,
  effectiveDefaultShellId,
  isScanning,
  onChangeDefaultShellId,
  onRescan,
}) => {
  const { t } = useI18n();

  return (
    <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-300 font-medium min-w-0">
          <TerminalIcon className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="truncate" title={t("settings.default_shell")}>
            {t("settings.default_shell")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {availableShells.length > 0 && (
            <Select
              value={effectiveDefaultShellId}
              onChange={(e) => onChangeDefaultShellId(e.target.value)}
              containerClassName="w-48 shrink-0"
            >
              {availableShells.map((shell) => (
                <option key={shell.id} value={shell.id}>
                  {shell.name}
                </option>
              ))}
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isScanning}
            onClick={onRescan}
            title={t("app.rescan")}
            leftIcon={<RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />}
          >
            {availableShells.length === 0 ? t("app.rescan") : undefined}
          </Button>
        </div>
      </div>
      {availableShells.length === 0 && (
        <p className="text-[11px] text-amber-300/90">{t("settings.no_shells")}</p>
      )}
    </div>
  );
};
