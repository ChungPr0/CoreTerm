import React, { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { AlertCircle, RotateCw } from "lucide-react";
import type { TerminalTabItem } from "@/shared/types/ipc";
import type { SessionConnectAckDto, TelemetryMetricsEventDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { useAutoReconnect } from "@/shared/hooks/useAutoReconnect";
import { useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { TelemetryBar } from "./TelemetryBar";
import {
  useTerminalSession,
  type TerminalContextActions,
} from "../hooks/useTerminalSession";

export type { TerminalContextActions };

interface TerminalViewportProps {
  tab: TerminalTabItem;
  isActive: boolean;
  launchCols: number;
  launchRows: number;
  showTelemetry: boolean;
  telemetry?: TelemetryMetricsEventDto;
  focusToken?: number;
  suppressAutoFocus?: boolean;
  onReconnect: (tabId: string) => void;
  onToggleAutoReconnect: (tabId: string, enabled: boolean) => void;
  onSessionAck?: (tabId: string, ack: SessionConnectAckDto) => void;
  onElevationCancelled?: (tabId: string) => void;
  onContextMenuTerminal?: (
    e: React.MouseEvent,
    tab: TerminalTabItem,
    actions: TerminalContextActions
  ) => void;
  onContextMenuBanner?: (e: React.MouseEvent, tab: TerminalTabItem) => void;
  onContextMenuTelemetry?: (e: React.MouseEvent, tab: TerminalTabItem) => void;
}

export const TerminalViewport: React.FC<TerminalViewportProps> = ({
  tab,
  isActive,
  launchCols,
  launchRows,
  showTelemetry,
  telemetry,
  focusToken = 0,
  suppressAutoFocus = false,
  onReconnect,
  onToggleAutoReconnect,
  onSessionAck,
  onElevationCancelled,
  onContextMenuTerminal,
  onContextMenuBanner,
  onContextMenuTelemetry,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const lastAlertErrRef = useRef<string | null>(null);

  const { containerRef, focus, getContextActions } = useTerminalSession({
    tab,
    isActive,
    launchCols,
    launchRows,
    focusToken,
    suppressAutoFocus,
    onSessionAck,
    onElevationCancelled,
  });

  useAutoReconnect(
    tab.hostId !== "local" && Boolean(tab.autoReconnect),
    tab.state === "DISCONNECTED" || tab.state === "ERROR",
    tab.reconnectIntervalSec,
    () => onReconnect(tab.tabId)
  );

  const isDisconnected =
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED" ||
    tab.state === "PORT_CONFLICT";

  useEffect(() => {
    if (!isDisconnected) {
      lastAlertErrRef.current = null;
      return;
    }
    const errKey = tab.errorMessage ? `${tab.state}:${tab.errorMessage}` : null;
    if (errKey && lastAlertErrRef.current !== errKey) {
      lastAlertErrRef.current = errKey;
      alert.error(formatLocalizedError(tab.errorMessage, t));
    }
  }, [isDisconnected, tab.state, tab.errorMessage, alert, t]);

  return (
    <div
      style={{ display: isActive ? "flex" : "none" }}
      className="flex-1 flex flex-col h-full w-full bg-[#090d16] overflow-hidden relative"
    >
      {isDisconnected && (
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
            onClick={() => onReconnect(tab.tabId)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
          >
            <RotateCw className="w-3 h-3" />
            <span>{t("session.reconnect")}</span>
          </button>
        </div>
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

      {showTelemetry && (
        <div className="absolute bottom-2.5 right-4 z-20">
          <TelemetryBar
            metrics={telemetry}
            sessionState={tab.state}
            onContextMenu={(e) => onContextMenuTelemetry?.(e, tab)}
          />
        </div>
      )}
    </div>
  );
};
