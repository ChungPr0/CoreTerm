import React, { useCallback } from "react";
import {
  CopyPlus,
  Edit3,
  FolderSync,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  RotateCw,
  Scaling,
  Search,
  Shield,
  Terminal as TerminalIcon,
  X,
  XCircle,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import { windowApi, type WindowSysAction } from "../api/windowApi";
import type { ShellProfile, TerminalTabItem } from "../types";
import { ShellIcon } from "../components/ShellIcon";
import { isTabOffline } from "../utils/tabHelpers";

export interface LocalTabLaunchOpts {
  profile?: ShellProfile;
  asAdmin?: boolean;
}

export interface BuildLaunchItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile;
  contextShell?: ShellProfile;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
}

export function buildLaunchItems({
  t,
  isAppElevated,
  shellProfiles,
  defaultShellProfile,
  contextShell,
  onNewLocalTab,
}: BuildLaunchItemsOpts): ContextMenuEntry[] {
  const shells =
    shellProfiles.length > 0 ? shellProfiles : [defaultShellProfile];
  const adminTarget = contextShell ?? defaultShellProfile;

  const mapShellEntries = (asAdmin: boolean): ContextMenuEntry[] =>
    shells.map((shell) => ({
      id: `${asAdmin ? "open-shell-admin" : "open-shell"}-${shell.id}`,
      label: shell.name,
      icon: <ShellIcon profile={shell} />,
      ...(asAdmin ? { highlight: "admin" as const } : {}),
      onSelect: () => onNewLocalTab({ profile: shell, asAdmin }),
    }));

  const adminSubmenu: ContextMenuEntry = {
    id: "open-shell-admin-submenu",
    label: t("ctx.open_shell_admin"),
    icon: <Shield className="h-3.5 w-3.5" />,
    highlight: "admin",
    children: mapShellEntries(true),
  };

  if (isAppElevated) {
    return [
      {
        id: "new-tab",
        label: t("ctx.new_tab_admin_name", { name: defaultShellProfile.name }),
        icon: <ShellIcon profile={defaultShellProfile} />,
        highlight: "admin",
        shortcut: "Ctrl+Shift+T",
        onSelect: () =>
          onNewLocalTab({ profile: defaultShellProfile, asAdmin: true }),
      },
      adminSubmenu,
    ];
  }

  return [
    {
      id: "new-tab",
      label: t("ctx.new_tab_name", { name: defaultShellProfile.name }),
      icon: <ShellIcon profile={defaultShellProfile} />,
      shortcut: "Ctrl+Shift+T",
      onSelect: () =>
        onNewLocalTab({ profile: defaultShellProfile, asAdmin: false }),
    },
    {
      id: "new-admin-tab",
      label: t("ctx.open_shell_admin_name", { name: adminTarget.name }),
      icon: <Shield className="h-3.5 w-3.5" />,
      highlight: "admin",
      onSelect: () => onNewLocalTab({ profile: adminTarget, asAdmin: true }),
    },
    {
      id: "open-shell-submenu",
      label: t("ctx.open_shell"),
      icon: <TerminalIcon className="h-3.5 w-3.5 text-sky-400" />,
      children: mapShellEntries(false),
    },
    adminSubmenu,
  ];
}

export function buildSftpPanelItem(
  t: (key: string, params?: Record<string, string | number>) => string,
  id: string,
  tab: TerminalTabItem,
  onToggleSftp: (tabId: string) => void
): ContextMenuEntry {
  return {
    id,
    label: t("ctx.sftp_panel"),
    icon: (
      <FolderSync
        className={`h-3.5 w-3.5 ${tab.sftpOpen ? "text-emerald-400" : "text-sky-400"}`}
      />
    ),
    badge: {
      text: tab.sftpOpen ? t("ctx.state_on") : t("ctx.state_off"),
      active: Boolean(tab.sftpOpen),
    },
    onSelect: () => onToggleSftp(tab.tabId),
  };
}

export function buildTabBarWindowMenu(
  t: (key: string, params?: Record<string, string | number>) => string,
  isMaximized: boolean,
  onAction: (action: WindowSysAction) => void
): ContextMenuEntry[] {
  return [
    {
      id: "win-restore",
      label: t("window.restore"),
      icon: <Minimize2 className="h-3.5 w-3.5" />,
      disabled: !isMaximized,
      onSelect: () => onAction("restore"),
    },
    {
      id: "win-move",
      label: t("window.move"),
      icon: <Move className="h-3.5 w-3.5" />,
      disabled: isMaximized,
      onSelect: () => onAction("move"),
    },
    {
      id: "win-size",
      label: t("window.size"),
      icon: <Scaling className="h-3.5 w-3.5" />,
      disabled: isMaximized,
      onSelect: () => onAction("size"),
    },
    {
      id: "win-minimize",
      label: t("window.minimize"),
      icon: <Minus className="h-3.5 w-3.5" />,
      onSelect: () => onAction("minimize"),
    },
    {
      id: "win-maximize",
      label: t("window.maximize"),
      icon: <Maximize2 className="h-3.5 w-3.5" />,
      disabled: isMaximized,
      onSelect: () => onAction("maximize"),
    },
    { type: "separator", id: "sep-win-close" },
    {
      id: "win-close",
      label: t("window.close"),
      icon: <X className="h-3.5 w-3.5" />,
      shortcut: "Alt+F4",
      danger: true,
      onSelect: () => onAction("close"),
    },
  ];
}

interface BuildTabContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tab: TerminalTabItem;
  tabsCount: number;
  allProfiles: HostProfileSummaryDto[];
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onRenameTab: (tabId: string) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
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
      shortcut: "Ctrl+F",
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
  }

  items.push(
    { type: "separator", id: "sep-tab-1" },
    ...buildLaunchItems({
      t,
      isAppElevated,
      shellProfiles,
      defaultShellProfile,
      contextShell: tab.hostId === "local" ? tab.shellProfile : undefined,
      onNewLocalTab,
    }),
    { type: "separator", id: "sep-tab-2" },
    {
      id: "tab-close",
      label: t("ctx.close_tab"),
      icon: <X className="h-3.5 w-3.5" />,
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
  defaultShellProfile: ShellProfile;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onRenameTab: (tabId: string) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
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
              void windowApi.windowSysCommand(action).catch(() => {});
            }),
          });
        });
    },
    [setContextMenu, t]
  );

  return { openTabMenu, openTabBarMenu };
}
