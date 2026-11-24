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
import { Button } from "@/shared/ui";
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
              <p className="text-[11px] font-mono text-rose-300 break-words select-text">
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
            <Button
              variant="primary"
              size="sm"
              loading={isPickingShell}
              leftIcon={<FolderOpen className="w-3.5 h-3.5" />}
              onClick={() => {
                setIsPickingShell(true);
                Promise.resolve(onPickShell(tab.tabId)).finally(() =>
                  setIsPickingShell(false)
                );
              }}
            >
              {t("terminal.pick_shell")}
            </Button>
          )}

          {onSwitchShell &&
            altShells.map((alt) => (
              <Button
                key={alt.id}
                variant="outline"
                size="sm"
                className="text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20"
                leftIcon={<TerminalIcon className="w-3.5 h-3.5" />}
                onClick={() => onSwitchShell(tab.tabId, alt)}
              >
                {t("terminal.switch_shell", { name: alt.name })}
              </Button>
            ))}

          {onRescan && (
            <Button
              variant="secondary"
              size="sm"
              loading={isRescanning}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => {
                setIsRescanning(true);
                Promise.resolve(onRescan(tab.tabId)).finally(() =>
                  setIsRescanning(false)
                );
              }}
            >
              {t("app.rescan")}
            </Button>
          )}

          {onOpenSettings && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Settings className="w-3.5 h-3.5" />}
              onClick={onOpenSettings}
            >
              {t("terminal.shell_settings")}
            </Button>
          )}

          {onOpenSsh && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Server className="w-3.5 h-3.5 text-emerald-400" />}
              onClick={onOpenSsh}
            >
              {t("terminal.ssh_list")}
            </Button>
          )}

          {tab.shellProfile && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RotateCw className="w-3.5 h-3.5" />}
              onClick={onReconnect}
            >
              {t("session.reconnect")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
