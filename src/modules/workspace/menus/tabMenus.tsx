import React, { useCallback } from "react";
import {
  Copy,
  CopyPlus,
  Edit3,
  FolderSync,
  RotateCw,
  Search,
  Server,
  Settings as SettingsIcon,
  X,
  XCircle,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import { copyText } from "@/shared/utils/clipboard";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import { windowApi, type WindowSysAction } from "../api/windowApi";
import { startInteractiveWindowMove } from "../utils/interactiveWindowActions";
import type { ShellProfile, TerminalTabItem } from "../types";
import { isTabConnecting, isTabOffline } from "../utils/tabHelpers";
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
  onOpenSettings?: () => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
}

function buildOpenSshEntry(
  t: (key: string, params?: Record<string, string | number>) => string,
  profile: HostProfileSummaryDto,
  onConnectHost: (host: HostProfileSummaryDto) => void
): ContextMenuEntry {
  return {
    id: "tab-ssh-open",
    label: t("ctx.ssh_open_tab"),
    icon: <Server className="h-3.5 w-3.5 text-emerald-400" />,
    onSelect: () => onConnectHost(profile),
  };
}

function buildOpenSftpEntry(
  t: (key: string, params?: Record<string, string | number>) => string,
  profile: HostProfileSummaryDto,
  onOpenSftp: (host: HostProfileSummaryDto) => void
): ContextMenuEntry {
  return {
    id: "tab-sftp-separate",
    label: t("ctx.sftp_open_tab"),
    icon: <FolderSync className="h-3.5 w-3.5 text-emerald-400" />,
    onSelect: () => onOpenSftp(profile),
  };
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
  onOpenSettings,
  onCloseTab,
  onCloseOtherTabs,
}: BuildTabContextItemsOpts): ContextMenuEntry[] {
  const isEditor = tab.tabKind === "editor";
  const isRemoteEditor = isEditor && tab.editorFile?.kind === "remote";
  const isLocal = !isEditor && tab.hostId === "local";
  const isRemoteSession = !isEditor && tab.hostId !== "local";
  const connecting = isTabConnecting(tab);
  const hostProfile =
    isRemoteEditor || isRemoteSession
      ? allProfiles.find((p) => p.id === tab.hostId)
      : undefined;

  const items: ContextMenuEntry[] = [];

  if (isEditor) {
    items.push({
      id: "tab-find",
      label: t("ctx.find"),
      icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+F",
      onSelect: () => onFindInTab(tab.tabId),
    });
    if (tab.editorFile?.path) {
      const pathToCopy = tab.editorFile.path;
      items.push({
        id: "tab-copy-path",
        label: t("ctx.sftp_copy_path"),
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => void copyText(pathToCopy),
      });
    }
    if (isRemoteEditor) {
      items.push({
        id: "tab-reconnect",
        label: t("common.reconnect"),
        icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
        disabled: connecting,
        onSelect: () => onReconnectTab(tab.tabId),
      });
      if (hostProfile) {
        items.push(
          buildOpenSshEntry(t, hostProfile, onConnectHost),
          buildOpenSftpEntry(t, hostProfile, onOpenSftp)
        );
      }
    }
  } else {
    items.push({
      id: "tab-duplicate",
      label: t("ctx.duplicate_tab"),
      icon: <CopyPlus className="h-3.5 w-3.5" />,
      onSelect: () => onDuplicateTab(tab),
    });

    // Allow inline rename only for local shell tabs; SSH tabs follow their saved Host Profile name.
    if (isLocal) {
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

    if (!isLocal || isTabOffline(tab)) {
      items.push({
        id: "tab-reconnect",
        label: t("common.reconnect"),
        icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
        disabled: connecting,
        onSelect: () => onReconnectTab(tab.tabId),
      });
    }

    if (isRemoteSession && tab.tabKind !== "sftp") {
      items.push(buildSftpPanelItem(t, "tab-sftp-split", tab, onToggleSftp));
      if (hostProfile) {
        items.push(buildOpenSftpEntry(t, hostProfile, onOpenSftp));
      }
    } else if (isRemoteSession && tab.tabKind === "sftp" && hostProfile) {
      items.push(buildOpenSshEntry(t, hostProfile, onConnectHost));
    }
  }

  const launchItems = buildLaunchItems({
    t,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    contextShell: isLocal ? tab.shellProfile : undefined,
    onNewLocalTab,
  });

  if (launchItems.length > 0) {
    items.push({ type: "separator", id: "sep-tab-1" }, ...launchItems);
  }

  items.push({ type: "separator", id: "sep-tab-2" });

  if (onOpenSettings) {
    items.push({
      id: "tab-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: "Ctrl+,",
      onSelect: onOpenSettings,
    });
  }

  items.push({
    id: "tab-close",
    label: t("ctx.close_tab"),
    icon: <X className="h-3.5 w-3.5" />,
    shortcut: "Ctrl+Shift+W",
    onSelect: () => onCloseTab(tab.tabId),
  });

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

export interface BuildTabBarContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isMaximized: boolean;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onOpenSettings?: () => void;
  onWindowAction: (action: WindowSysAction) => void;
}

export function buildTabBarContextItems({
  t,
  isMaximized,
  isAppElevated,
  shellProfiles,
  defaultShellProfile,
  onNewLocalTab,
  onOpenSettings,
  onWindowAction,
}: BuildTabBarContextItemsOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];
  const launchItems = buildLaunchItems({
    t,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    onNewLocalTab,
  });
  if (launchItems.length > 0) {
    items.push(...launchItems);
  }
  if (onOpenSettings) {
    items.push({
      id: "tabbar-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: "Ctrl+,",
      onSelect: onOpenSettings,
    });
  }
  if (items.length > 0) {
    items.push({ type: "separator", id: "sep-tabbar-win" });
  }
  items.push(...buildTabBarWindowMenu(t, isMaximized, onWindowAction));
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
  onOpenSettings?: () => void;
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
    onOpenSettings,
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
          onOpenSettings,
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
      onOpenSettings,
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
            items: buildTabBarContextItems({
              t,
              isMaximized,
              isAppElevated,
              shellProfiles,
              defaultShellProfile,
              onNewLocalTab,
              onOpenSettings,
              onWindowAction: (action) => {
                if (action === "move") {
                  void startInteractiveWindowMove();
                  return;
                }
                void windowApi.windowSysCommand(action).catch(() => {});
              },
            }),
          });
        });
    },
    [
      defaultShellProfile,
      isAppElevated,
      onNewLocalTab,
      onOpenSettings,
      setContextMenu,
      shellProfiles,
      t,
    ]
  );

  return { openTabMenu, openTabBarMenu };
}
