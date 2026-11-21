import React, { useCallback } from "react";
import {
  CopyPlus,
  Edit3,
  FolderSync,
  RotateCw,
  Search,
  Server,
  X,
  XCircle,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import { windowApi } from "../api/windowApi";
import { startInteractiveWindowMove } from "../utils/interactiveWindowActions";
import type { ShellProfile, TerminalTabItem } from "../types";
import { isTabOffline } from "../utils/tabHelpers";
import {
  buildLaunchItems,
  buildSftpPanelItem,
  buildTabBarWindowMenu,
  type BuildLaunchItemsOpts,
  type LocalTabLaunchOpts,
} from "./launchMenus";

export {
  buildLaunchItems,
  buildSftpPanelItem,
  buildTabBarWindowMenu,
  type BuildLaunchItemsOpts,
  type LocalTabLaunchOpts,
};

interface BuildTabContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tab: TerminalTabItem;
  tabsCount: number;
  allProfiles: HostProfileSummaryDto[];
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onRenameTab: (tabId: string) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
  onConnectHost: (host: HostProfileSummaryDto) => void;
  onDuplicateTab: (tab: TerminalTabItem) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
}

export function buildTabContextItems({
  t,
  tab,
  tabsCount,
  allProfiles,
  isAppElevated,
  shellProfiles,
  defaultShellProfile,
  onNewLocalTab,
  onRenameTab,
  onFindInTab,
  onReconnectTab,
  onToggleSftp,
  onOpenSftp,
  onConnectHost,
  onDuplicateTab,
  onCloseTab,
  onCloseOtherTabs,
}: BuildTabContextItemsOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [
    {
      id: "tab-duplicate",
      label: t("ctx.duplicate_tab"),
      icon: <CopyPlus className="h-3.5 w-3.5" />,
      onSelect: () => onDuplicateTab(tab),
    },
  ];

  // Allow inline rename only for local shell tabs; SSH tabs follow their saved Host Profile name.
  if (tab.hostId === "local") {
    items.push({
      id: "tab-rename",
      label: t("ctx.rename_tab"),
      icon: <Edit3 className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: () => onRenameTab(tab.tabId),
    });
  }

  if (tab.tabKind !== "sftp") {
    items.push({
      id: "tab-find",
      label: t("ctx.find"),
      icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+Shift+F",
      onSelect: () => onFindInTab(tab.tabId),
    });
  }

  if (tab.hostId !== "local" || isTabOffline(tab)) {
    items.push({
      id: "tab-reconnect",
      label: t("common.reconnect"),
      icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: () => onReconnectTab(tab.tabId),
    });
  }

  if (tab.hostId !== "local" && tab.tabKind !== "sftp") {
    items.push(
      buildSftpPanelItem(t, "tab-sftp-split", tab, onToggleSftp),
      {
        id: "tab-sftp-separate",
        label: t("ctx.sftp_open_tab"),
        icon: <FolderSync className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => {
          const profile = allProfiles.find((p) => p.id === tab.hostId);
          if (profile) onOpenSftp(profile);
        },
      }
    );
  } else if (tab.hostId !== "local" && tab.tabKind === "sftp") {
    const profile = allProfiles.find((p) => p.id === tab.hostId);
    if (profile) {
      items.push({
        id: "tab-ssh-open",
        label: t("ctx.ssh_open_tab"),
        icon: <Server className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => onConnectHost(profile),
      });
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

  items.push(
    ...(launchItems.length > 0
      ? [{ type: "separator" as const, id: "sep-tab-1" }, ...launchItems]
      : []),
    { type: "separator", id: "sep-tab-2" },
    {
      id: "tab-close",
      label: t("ctx.close_tab"),
      icon: <X className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+Shift+W",
      onSelect: () => onCloseTab(tab.tabId),
    }
  );

  if (tabsCount > 1) {
    items.push({
      id: "tab-close-others",
      label: t("ctx.close_other_tabs"),
      icon: <XCircle className="h-3.5 w-3.5" />,
      onSelect: () => onCloseOtherTabs(tab.tabId),
    });
  }

  return items;
}

interface UseTabMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tabs: TerminalTabItem[];
  allProfiles: HostProfileSummaryDto[];
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onRenameTab: (tabId: string) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
  onConnectHost: (host: HostProfileSummaryDto) => void;
  onDuplicateTab: (tab: TerminalTabItem) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
}

export function useTabMenus(opts: UseTabMenusOpts) {
  const {
    t,
    tabs,
    allProfiles,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    setContextMenu,
    onNewLocalTab,
    onRenameTab,
    onFindInTab,
    onReconnectTab,
    onToggleSftp,
    onOpenSftp,
    onConnectHost,
    onDuplicateTab,
    onCloseTab,
    onCloseOtherTabs,
  } = opts;

  const openTabMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildTabContextItems({
          t,
          tab,
          tabsCount: tabs.length,
          allProfiles,
          isAppElevated,
          shellProfiles,
          defaultShellProfile,
          onNewLocalTab,
          onRenameTab,
          onFindInTab,
          onReconnectTab,
          onToggleSftp,
          onOpenSftp,
          onConnectHost,
          onDuplicateTab,
          onCloseTab,
          onCloseOtherTabs,
        }),
      });
    },
    [
      allProfiles,
      defaultShellProfile,
      isAppElevated,
      onCloseOtherTabs,
      onCloseTab,
      onConnectHost,
      onDuplicateTab,
      onFindInTab,
      onNewLocalTab,
      onOpenSftp,
      onReconnectTab,
      onRenameTab,
      onToggleSftp,
      setContextMenu,
      shellProfiles,
      t,
      tabs.length,
    ]
  );

  const openTabBarMenu = useCallback(
    (e: React.MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      void windowApi
        .windowIsMaximized()
        .catch(() => false)
        .then((isMaximized) => {
          setContextMenu({
            x,
            y,
            items: buildTabBarWindowMenu(t, isMaximized, (action) => {
              if (action === "move") {
                void startInteractiveWindowMove();
                return;
              }
              void windowApi.windowSysCommand(action).catch(() => {});
            }),
          });
        });
    },
    [setContextMenu, t]
  );

  return { openTabMenu, openTabBarMenu };
}
