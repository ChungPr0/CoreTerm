import React, { useState } from "react";
import {
  AlertCircle,
  FolderOpen,
  RefreshCw,
  RotateCw,
  Server,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { formatLocalizedError } from "@/shared/utils/formatError";

interface ShellErrorOverlayProps {
  tab: TerminalTabItem;
  availableShells: ShellProfile[];
  onSwitchShell?: (tabId: string, profile: ShellProfile) => void;
  onPickShell?: (tabId: string) => Promise<void> | void;
  onRescan?: (tabId: string) => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenSsh?: () => void;
  onReconnect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const ShellErrorOverlay: React.FC<ShellErrorOverlayProps> = ({
  tab,
  availableShells,
  onSwitchShell,
  onPickShell,
  onRescan,
  onOpenSettings,
  onOpenSsh,
  onReconnect,
  onContextMenu,
}) => {
  const { t } = useI18n();
  const [isPickingShell, setIsPickingShell] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);

  const altShells = availableShells
    .filter((s) => s.id !== tab.shellProfile?.id)
    .slice(0, 2);

  return (
    <div
      onContextMenu={onContextMenu}
      className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-[#090d16]/85 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl space-y-3.5 text-xs">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">
              {t("terminal.shell_err_title")}
            </h3>
            {tab.errorMessage && (
              <p className="text-[11px] font-mono text-rose-300 break-words">
                {formatLocalizedError(tab.errorMessage, t)}
              </p>
            )}
            <p className="text-slate-400 leading-relaxed">
              {t("terminal.shell_err_desc")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onPickShell && (
            <button
              type="button"
              disabled={isPickingShell}
              onClick={() => {
                setIsPickingShell(true);
                Promise.resolve(onPickShell(tab.tabId)).finally(() =>
                  setIsPickingShell(false)
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t("terminal.pick_shell")}</span>
            </button>
          )}

          {onSwitchShell &&
            altShells.map((alt) => (
              <button
                key={alt.id}
                type="button"
                onClick={() => onSwitchShell(tab.tabId, alt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-medium transition-colors"
              >
                <TerminalIcon className="w-3.5 h-3.5" />
                <span>{t("terminal.switch_shell", { name: alt.name })}</span>
              </button>
            ))}

          {onRescan && (
            <button
              type="button"
              disabled={isRescanning}
              onClick={() => {
                setIsRescanning(true);
                Promise.resolve(onRescan(tab.tabId)).finally(() =>
                  setIsRescanning(false)
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRescanning ? "animate-spin" : ""}`}
              />
              <span>{t("app.rescan")}</span>
            </button>
          )}

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t("terminal.shell_settings")}</span>
            </button>
          )}

          {onOpenSsh && (
            <button
              type="button"
              onClick={onOpenSsh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t("terminal.ssh_list")}</span>
            </button>
          )}

          {tab.shellProfile && (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{t("session.reconnect")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
