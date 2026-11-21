import React, { useCallback } from "react";
import {
  Clipboard,
  ClipboardCopy,
  Eraser,
  RotateCw,
  Search,
  Settings as SettingsIcon,
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

interface BuildTerminalContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tab: TerminalTabItem;
  actions: TerminalContextActions;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSettings: () => void;
}

export function buildTerminalContextItems({
  t,
  tab,
  actions,
  isAppElevated,
  shellProfiles,
  defaultShellProfile,
  onNewLocalTab,
  onFindInTab,
  onReconnectTab,
  onToggleSftp,
  onOpenSettings,
}: BuildTerminalContextItemsOpts): ContextMenuEntry[] {
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
      shortcut: "Ctrl+Shift+A",
      onSelect: actions.selectAll,
    },
    {
      id: "term-clear",
      label: t("ctx.clear_terminal"),
      icon: <Eraser className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+Shift+L",
      onSelect: actions.clear,
    },
    {
      id: "term-find",
      label: t("ctx.find"),
      icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+Shift+F",
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

  const launchItems = buildLaunchItems({
    t,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    contextShell: tab.hostId === "local" ? tab.shellProfile : undefined,
    onNewLocalTab,
  });
  if (launchItems.length > 0) {
    items.push({ type: "separator", id: "sep-term-launch" }, ...launchItems);
  }

  items.push(
    { type: "separator", id: "sep-term-settings" },
    {
      id: "term-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: "Ctrl+,",
      onSelect: onOpenSettings,
    }
  );

  return items;
}

interface BuildBannerContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tab: TerminalTabItem;
  selectedText: string;
  onCopy: (text: string) => void;
  onReconnectTab: (tabId: string) => void;
  onOpenSettings: () => void;
}

export function buildBannerContextItems({
  t,
  tab,
  selectedText,
  onCopy,
  onReconnectTab,
  onOpenSettings,
}: BuildBannerContextItemsOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];
  if (selectedText.length > 0) {
    items.push(
      {
        id: "banner-copy",
        label: t("ctx.copy"),
        icon: <ClipboardCopy className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+C",
        onSelect: () => onCopy(selectedText),
      },
      { type: "separator", id: "sep-banner" }
    );
  }
  items.push(
    {
      id: "banner-reconnect",
      label: t("common.reconnect"),
      icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: () => onReconnectTab(tab.tabId),
    },
    { type: "separator", id: "sep-banner-settings" },
    {
      id: "banner-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: "Ctrl+,",
      onSelect: onOpenSettings,
    }
  );
  return items;
}

interface UseTerminalMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSettings: () => void;
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
    onOpenSettings,
  } = opts;

  const openTerminalMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem, actions: TerminalContextActions) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildTerminalContextItems({
          t,
          tab,
          actions,
          isAppElevated,
          shellProfiles,
          defaultShellProfile,
          onNewLocalTab,
          onFindInTab,
          onReconnectTab,
          onToggleSftp,
          onOpenSettings,
        }),
      });
    },
    [
      defaultShellProfile,
      isAppElevated,
      onFindInTab,
      onNewLocalTab,
      onOpenSettings,
      onReconnectTab,
      onToggleSftp,
      setContextMenu,
      shellProfiles,
      t,
    ]
  );

  const openBannerMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      const selectedText = window.getSelection()?.toString() ?? "";
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildBannerContextItems({
          t,
          tab,
          selectedText,
          onCopy: (text) => void copyText(text),
          onReconnectTab,
          onOpenSettings,
        }),
      });
    },
    [onOpenSettings, onReconnectTab, setContextMenu, t]
  );

  return { openTerminalMenu, openBannerMenu };
}
