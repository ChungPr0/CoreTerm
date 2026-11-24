import React, { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { useAutoReconnect } from "@/shared/hooks/useAutoReconnect";
import { ReconnectBanner, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { useSettingsStore } from "@/modules/settings";
import { useTabsStore } from "@/modules/workspace/hooks/useTabsStore";
import type { SessionConnectAckDto } from "../types";
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
  onReconnect: (tabId: string, source?: "tab" | "auto" | "banner") => void;
  onSwitchShell?: (tabId: string, profile: ShellProfile) => void;
  onPickShell?: (tabId: string) => Promise<void> | void;
  onRescan?: (tabId: string) => Promise<void> | void;
  onOpenSettings?: () => void;
  onOpenSsh?: () => void;
  onToggleAutoReconnect?: (tabId: string, enabled: boolean) => void;
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
  onSessionAck,
  onElevationCancelled,
  onContextMenuTerminal,
  onContextMenuBanner,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const rightClickPaste = useSettingsStore((s) => s.settings.terminalRightClickPaste);
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
    enabled:
      tab.hostId !== "local" &&
      tab.canAutoReconnect !== false &&
      Boolean(tab.autoReconnect),
    connected: tab.state === "ONLINE",
    disconnected: tab.state === "DISCONNECTED" || tab.state === "ERROR",
    paused: pauseAutoReconnect,
    intervalSec: tab.reconnectIntervalSec,
    onReconnect: () => {
      useTabsStore.getState().bumpReconnectToken(tab.tabId, "auto");
    },
  });

  const isConnecting =
    tab.state === "CONNECTING" || tab.state === "HANDSHAKING";
  const isDisconnected =
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED" ||
    tab.state === "PORT_CONFLICT";
  const isLocalErr = tab.hostId === "local" && tab.state === "ERROR";
  const isAutoReconnect = Boolean(
    tab.hostId !== "local" &&
    tab.canAutoReconnect !== false &&
    tab.autoReconnect &&
    tab.state !== "AUTH_FAILED" &&
    tab.state !== "PORT_CONFLICT"
  );

  const showConnectingBanner =
    isConnecting && (tab.reconnectSource === "auto" || tab.reconnectSource === "banner");
  const showReconnectBanner =
    !isLocalErr && (isDisconnected || showConnectingBanner);

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
    onReconnect(tab.tabId, "banner");
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

      {isConnecting && (
        <div className="absolute top-0 left-0 right-0 z-30 h-[2px] overflow-hidden bg-sky-950/30 pointer-events-none">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#58a6ff] to-transparent animate-shimmer" />
        </div>
      )}

      {showReconnectBanner && (
        <ReconnectBanner
          isDisconnected={isDisconnected}
          isConnecting={isConnecting}
          isAutoReconnect={isAutoReconnect}
          onReconnect={manualReconnect}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenuBanner?.(e, tab);
          }}
        />
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
          if (rightClickPaste && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            const actions = getContextActions();
            if (actions.hasSelection) {
              void actions.copySelection().then(() => {
                terminalRef.current?.clearSelection();
              });
            } else if (!isDisconnected) {
              void actions.pasteClipboard();
            }
            return;
          }
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
