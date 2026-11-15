import React, { useCallback } from "react";
import {
  Clipboard,
  ClipboardCopy,
  Eraser,
  Eye,
  EyeOff,
  RotateCw,
  TextSelect,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import type { TerminalTabItem } from "@/shared/types/ipc";
import { copyText } from "@/shared/utils/clipboard";
import type { AppSettingsValues } from "@/modules/settings";
import { buildSftpPanelItem, isTabOffline } from "@/modules/workspace";
import type { TerminalContextActions } from "../hooks/useTerminalSession";

interface UseTerminalMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  settings: AppSettingsValues;
  hiddenTelemetryTabIds: Record<string, boolean>;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onShowTelemetry: (tabId: string) => void;
  onHideTelemetry: (tabId: string) => void;
  onFocusTerminal: () => void;
}

export function useTerminalMenus(opts: UseTerminalMenusOpts) {
  const {
    t,
    settings,
    hiddenTelemetryTabIds,
    setContextMenu,
    onReconnectTab,
    onToggleSftp,
    onShowTelemetry,
    onHideTelemetry,
    onFocusTerminal,
  } = opts;

  const openTerminalMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem, actions: TerminalContextActions) => {
      const offline = isTabOffline(tab);
      const items: ContextMenuEntry[] = [
        {
          id: "term-copy",
          label: t("ctx.copy"),
          icon: <ClipboardCopy className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+Shift+C",
          disabled: !actions.hasSelection,
          onSelect: () => void actions.copySelection(),
        },
        {
          id: "term-paste",
          label: t("ctx.paste"),
          icon: <Clipboard className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+Shift+V",
          disabled: offline,
          onSelect: () => void actions.pasteClipboard(),
        },
        {
          id: "term-select-all",
          label: t("ctx.select_all"),
          icon: <TextSelect className="h-3.5 w-3.5" />,
          onSelect: actions.selectAll,
        },
        {
          id: "term-clear",
          label: t("ctx.clear_terminal"),
          icon: <Eraser className="h-3.5 w-3.5" />,
          onSelect: actions.clear,
        },
      ];

      if (tab.hostId !== "local" || offline) {
        items.push(
          { type: "separator", id: "sep-term-reconnect" },
          {
            id: "term-reconnect",
            label: t("common.reconnect"),
            icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
            onSelect: () => onReconnectTab(tab.tabId),
          }
        );
        if (tab.hostId !== "local" && tab.tabKind !== "sftp") {
          items.push(buildSftpPanelItem(t, "term-sftp-split", tab, onToggleSftp));
        }
      }

      const configuredTelemetry =
        tab.hostId === "local"
          ? settings.showLocalTelemetry
          : (tab.telemetryEnabled ?? false);

      if (configuredTelemetry && hiddenTelemetryTabIds[tab.tabId]) {
        items.push(
          { type: "separator", id: "sep-term-telemetry" },
          {
            id: "term-show-telemetry",
            label: t("ctx.show_telemetry"),
            icon: <Eye className="h-3.5 w-3.5 text-emerald-400" />,
            onSelect: () => {
              onShowTelemetry(tab.tabId);
              actions.focus();
            },
          }
        );
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      hiddenTelemetryTabIds,
      onReconnectTab,
      onShowTelemetry,
      onToggleSftp,
      setContextMenu,
      settings.showLocalTelemetry,
      t,
    ]
  );

  const openTelemetryMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            id: "telemetry-hide",
            label: t("ctx.hide_telemetry"),
            icon: <EyeOff className="h-3.5 w-3.5 text-slate-400" />,
            onSelect: () => {
              onHideTelemetry(tab.tabId);
              onFocusTerminal();
            },
          },
        ],
      });
    },
    [onFocusTerminal, onHideTelemetry, setContextMenu, t]
  );

  const openBannerMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      const selected = window.getSelection()?.toString() ?? "";
      const items: ContextMenuEntry[] = [];
      if (selected.length > 0) {
        items.push(
          {
            id: "banner-copy",
            label: t("ctx.copy"),
            icon: <ClipboardCopy className="h-3.5 w-3.5" />,
            shortcut: "Ctrl+C",
            onSelect: () => void copyText(selected),
          },
          { type: "separator", id: "sep-banner" }
        );
      }
      items.push({
        id: "banner-reconnect",
        label: t("common.reconnect"),
        icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
        onSelect: () => onReconnectTab(tab.tabId),
      });
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [onReconnectTab, setContextMenu, t]
  );

  return { openTerminalMenu, openTelemetryMenu, openBannerMenu };
}
