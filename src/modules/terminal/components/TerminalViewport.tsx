import React, { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { AlertCircle, RotateCw } from "lucide-react";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import type { SessionConnectAckDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { useAutoReconnect } from "@/shared/hooks/useAutoReconnect";
import { useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import {
  useTerminalSession,
  type LaunchWinSize,
  type TerminalContextActions,
} from "../hooks/useTerminalSession";
import { useTerminalFind } from "../hooks/useTerminalFind";
import { ShellErrorOverlay } from "./ShellErrorOverlay";
import { TerminalFindBar } from "./TerminalFindBar";

export type { LaunchWinSize, TerminalContextActions };

interface TerminalViewportProps {
  tab: TerminalTabItem;
  isActive: boolean;
  launchCols: number;
  launchRows: number;
  focusToken?: number;
  findToken?: number;
  suppressAutoFocus?: boolean;
  pauseAutoReconnect?: boolean;
  availableShells?: ShellProfile[];
  onPresentWindow?: (size: LaunchWinSize) => Promise<boolean>;
  onReconnect: (tabId: string) => void;
  onSwitchShell?: (tabId: string, profile: ShellProfile) => void;
  onPickShell?: (tabId: string) => Promise<void> | void;
  onRescan?: (tabId: string) => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenSsh?: () => void;
  onToggleAutoReconnect: (tabId: string, enabled: boolean) => void;
  onSessionAck?: (tabId: string, ack: SessionConnectAckDto) => void;
  onElevationCancelled?: (tabId: string) => void;
  onContextMenuTerminal?: (
    e: React.MouseEvent,
    tab: TerminalTabItem,
    actions: TerminalContextActions
  ) => void;
  onContextMenuBanner?: (e: React.MouseEvent, tab: TerminalTabItem) => void;
}

export const TerminalViewport: React.FC<TerminalViewportProps> = ({
  tab,
  isActive,
  launchCols,
  launchRows,
  focusToken = 0,
  findToken = 0,
  suppressAutoFocus = false,
  pauseAutoReconnect = false,
  availableShells = [],
  onPresentWindow,
  onReconnect,
  onSwitchShell,
  onPickShell,
  onRescan,
  onOpenSettings,
  onOpenSsh,
  onToggleAutoReconnect,
  onSessionAck,
  onElevationCancelled,
  onContextMenuTerminal,
  onContextMenuBanner,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const lastAlertErrRef = useRef<string | null>(null);

  const { containerRef, terminalRef, searchAddonRef, focus, getContextActions } =
    useTerminalSession({
      tab,
      isActive,
      launchCols,
      launchRows,
      focusToken,
      suppressAutoFocus,
      onPresentWindow,
      onSessionAck,
      onElevationCancelled,
    });

  const find = useTerminalFind({
    terminalRef,
    searchAddonRef,
    isActive,
    findToken,
  });

  useAutoReconnect({
    enabled: tab.hostId !== "local" && Boolean(tab.autoReconnect),
    connected: tab.state === "ONLINE",
    disconnected: tab.state === "DISCONNECTED" || tab.state === "ERROR",
    paused: pauseAutoReconnect,
    intervalSec: tab.reconnectIntervalSec,
    onReconnect: () => onReconnect(tab.tabId),
  });

  const isDisconnected =
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED" ||
    tab.state === "PORT_CONFLICT";
  const isLocalErr = tab.hostId === "local" && tab.state === "ERROR";

  useEffect(() => {
    if (tab.state === "ONLINE") {
      lastAlertErrRef.current = null;
      return;
    }
    if (!isDisconnected) return;
    const errKey = tab.errorMessage ? `${tab.state}:${tab.errorMessage}` : null;
    if (errKey && lastAlertErrRef.current !== errKey) {
      lastAlertErrRef.current = errKey;
      alert.error(formatLocalizedError(tab.errorMessage, t));
    }
  }, [isDisconnected, tab.state, tab.errorMessage, alert, t]);

  const manualReconnect = () => {
    lastAlertErrRef.current = null;
    onReconnect(tab.tabId);
  };

  return (
    <div
      style={{ display: isActive ? "flex" : "none" }}
      className="flex-1 flex flex-col h-full w-full bg-[#090d16] overflow-hidden relative"
    >
      <TerminalFindBar
        isOpen={find.isOpen}
        inputRef={find.inputRef}
        query={find.query}
        onChangeQuery={find.setQuery}
        caseSensitive={find.caseSensitive}
        onToggleCaseSensitive={find.toggleCaseSensitive}
        regex={find.regex}
        onToggleRegex={find.toggleRegex}
        invalidRegex={find.invalidRegex}
        matches={find.matches}
        onFindPrev={find.findPrev}
        onFindNext={find.findNext}
        onClose={find.closeFind}
      />

      {isDisconnected && !isLocalErr && (
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenuBanner?.(e, tab);
          }}
          className="absolute top-2.5 right-3 z-20 px-3 py-1.5 rounded-lg bg-slate-900/95 backdrop-blur-md border border-rose-500/40 shadow-xl flex items-center gap-3 text-xs text-rose-200 select-none"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>
              {t("status.disconnected")} ({tab.state})
            </span>
          </div>
          {tab.hostId !== "local" && (
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={!!tab.autoReconnect}
                onChange={(e) =>
                  onToggleAutoReconnect(tab.tabId, e.target.checked)
                }
              />
              <span>{t("session.auto_reconnect")}</span>
            </label>
          )}
          <button
            type="button"
            onClick={manualReconnect}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
          >
            <RotateCw className="w-3 h-3" />
            <span>{t("session.reconnect")}</span>
          </button>
        </div>
      )}

      {isLocalErr && (
        <ShellErrorOverlay
          tab={tab}
          availableShells={availableShells}
          onSwitchShell={onSwitchShell}
          onPickShell={onPickShell}
          onRescan={onRescan}
          onOpenSettings={onOpenSettings}
          onOpenSsh={onOpenSsh}
          onReconnect={manualReconnect}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenuBanner?.(e, tab);
          }}
        />
      )}

      <div
        onClick={focus}
        onContextMenu={(e) => {
          if (!onContextMenuTerminal) return;
          e.preventDefault();
          e.stopPropagation();
          onContextMenuTerminal(e, tab, getContextActions());
        }}
        className="flex-1 w-full h-full p-1.5 overflow-hidden bg-[#090d16]"
      >
        <div
          ref={containerRef}
          className="w-full h-full overflow-hidden xterm-no-scrollback bg-[#090d16]"
        />
      </div>
    </div>
  );
};
