import React, { useCallback } from "react";
import {
  Clipboard,
  ClipboardCopy,
  Eraser,
  FolderSync,
  RotateCw,
  Search,
  Settings as SettingsIcon,
  TextSelect,
  X,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { copyText } from "@/shared/utils/clipboard";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import {
  buildLaunchItems,
  buildSftpPanelItem,
  isTabConnecting,
  isTabOffline,
  type LocalTabLaunchOpts,
} from "@/modules/workspace";
import type { TerminalContextActions } from "../hooks/useTerminalSession";

export interface BuildTerminalContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tab: TerminalTabItem;
  actions: TerminalContextActions;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  allProfiles?: HostProfileSummaryDto[];
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
  onOpenSettings: () => void;
  onCloseTab?: (tabId: string) => void;
}

function appendSshSftpItems(
  items: ContextMenuEntry[],
  t: (key: string, params?: Record<string, string | number>) => string,
  tab: TerminalTabItem,
  prefix: "term" | "banner",
  allProfiles: HostProfileSummaryDto[] | undefined,
  onToggleSftp: ((tabId: string) => void) | undefined,
  onOpenSftp: ((host: HostProfileSummaryDto) => void) | undefined
) {
  if (tab.hostId === "local" || tab.tabKind === "sftp") return;
  if (onToggleSftp) {
    items.push(buildSftpPanelItem(t, `${prefix}-sftp-split`, tab, onToggleSftp));
  }
  if (allProfiles && onOpenSftp) {
    const profile = allProfiles.find((p) => p.id === tab.hostId);
    if (profile) {
      items.push({
        id: `${prefix}-sftp-open`,
        label: t("ctx.sftp_open_tab"),
        icon: <FolderSync className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => onOpenSftp(profile),
      });
    }
  }
}

export function buildTerminalContextItems({
  t,
  tab,
  actions,
  isAppElevated,
  shellProfiles,
  defaultShellProfile,
  allProfiles,
  onNewLocalTab,
  onFindInTab,
  onReconnectTab,
  onToggleSftp,
  onOpenSftp,
  onOpenSettings,
  onCloseTab,
}: BuildTerminalContextItemsOpts): ContextMenuEntry[] {
  const offline = isTabOffline(tab);
  const connecting = isTabConnecting(tab);
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
        disabled: connecting,
        onSelect: () => onReconnectTab(tab.tabId),
      }
    );
    appendSshSftpItems(items, t, tab, "term", allProfiles, onToggleSftp, onOpenSftp);
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

  if (onCloseTab) {
    items.push({
      id: "term-close-tab",
      label: t("ctx.close_tab"),
      icon: <X className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+Shift+W",
      onSelect: () => onCloseTab(tab.tabId),
    });
  }

  return items;
}

export interface BuildBannerContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tab: TerminalTabItem;
  selectedText: string;
  allProfiles?: HostProfileSummaryDto[];
  onCopy: (text: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp?: (tabId: string) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
  onOpenSettings: () => void;
  onCloseTab?: (tabId: string) => void;
}

export function buildBannerContextItems({
  t,
  tab,
  selectedText,
  allProfiles,
  onCopy,
  onReconnectTab,
  onToggleSftp,
  onOpenSftp,
  onOpenSettings,
  onCloseTab,
}: BuildBannerContextItemsOpts): ContextMenuEntry[] {
  const connecting = isTabConnecting(tab);
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
  items.push({
    id: "banner-reconnect",
    label: t("common.reconnect"),
    icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
    disabled: connecting,
    onSelect: () => onReconnectTab(tab.tabId),
  });

  appendSshSftpItems(items, t, tab, "banner", allProfiles, onToggleSftp, onOpenSftp);

  items.push(
    { type: "separator", id: "sep-banner-settings" },
    {
      id: "banner-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: "Ctrl+,",
      onSelect: onOpenSettings,
    }
  );

  if (onCloseTab) {
    items.push({
      id: "banner-close-tab",
      label: t("ctx.close_tab"),
      icon: <X className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+Shift+W",
      onSelect: () => onCloseTab(tab.tabId),
    });
  }

  return items;
}

interface UseTerminalMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  allProfiles?: HostProfileSummaryDto[];
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
  onOpenSettings: () => void;
  onCloseTab?: (tabId: string) => void;
}

export function useTerminalMenus(opts: UseTerminalMenusOpts) {
  const {
    t,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    allProfiles,
    setContextMenu,
    onNewLocalTab,
    onFindInTab,
    onReconnectTab,
    onToggleSftp,
    onOpenSftp,
    onOpenSettings,
    onCloseTab,
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
          allProfiles,
          onNewLocalTab,
          onFindInTab,
          onReconnectTab,
          onToggleSftp,
          onOpenSftp,
          onOpenSettings,
          onCloseTab,
        }),
      });
    },
    [
      allProfiles,
      defaultShellProfile,
      isAppElevated,
      onCloseTab,
      onFindInTab,
      onNewLocalTab,
      onOpenSettings,
      onOpenSftp,
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
          allProfiles,
          onCopy: (text) => void copyText(text),
          onReconnectTab,
          onToggleSftp,
          onOpenSftp,
          onOpenSettings,
          onCloseTab,
        }),
      });
    },
    [allProfiles, onCloseTab, onOpenSettings, onOpenSftp, onReconnectTab, onToggleSftp, setContextMenu, t]
  );

  return { openTerminalMenu, openBannerMenu };
}
