import React, { useCallback } from "react";
import {
  Clipboard,
  ClipboardCopy,
  Eraser,
  RotateCw,
  Search,
  TextSelect,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { copyText } from "@/shared/utils/clipboard";
import {
  buildLaunchItems,
  buildSftpPanelItem,
  isTabOffline,
  type LocalTabLaunchOpts,
} from "@/modules/workspace";
import type { TerminalContextActions } from "../hooks/useTerminalSession";

interface UseTerminalMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
}

export function useTerminalMenus(opts: UseTerminalMenusOpts) {
  const {
    t,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    setContextMenu,
    onNewLocalTab,
    onFindInTab,
    onReconnectTab,
    onToggleSftp,
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
        {
          id: "term-find",
          label: t("ctx.find"),
          icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
          shortcut: "Ctrl+F",
          onSelect: () => onFindInTab(tab.tabId),
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

      items.push(
        { type: "separator", id: "sep-term-launch" },
        ...buildLaunchItems({
          t,
          isAppElevated,
          shellProfiles,
          defaultShellProfile,
          contextShell: tab.hostId === "local" ? tab.shellProfile : undefined,
          onNewLocalTab,
        })
      );

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      defaultShellProfile,
      isAppElevated,
      onFindInTab,
      onNewLocalTab,
      onReconnectTab,
      onToggleSftp,
      setContextMenu,
      shellProfiles,
      t,
    ]
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

  return { openTerminalMenu, openBannerMenu };
}
