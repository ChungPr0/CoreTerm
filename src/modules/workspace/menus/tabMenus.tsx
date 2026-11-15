import React, { useCallback } from "react";
import {
  CopyPlus,
  FolderSync,
  RotateCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  Terminal as TerminalIcon,
  X,
  XCircle,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import type { TerminalTabItem } from "../types";
import { isTabOffline } from "../utils/tabHelpers";

export function buildLaunchItems(
  t: (key: string, params?: Record<string, string | number>) => string,
  isAppElevated: boolean,
  onNewLocalTab: (asAdmin?: boolean) => void
): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [
    {
      id: "new-tab",
      label: t("ctx.new_tab"),
      icon: <TerminalIcon className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+Shift+T",
      onSelect: () => onNewLocalTab(isAppElevated),
    },
  ];
  if (!isAppElevated) {
    items.push({
      id: "new-admin-tab",
      label: t("ctx.new_admin_tab"),
      icon: <Shield className="h-3.5 w-3.5" />,
      highlight: "admin",
      onSelect: () => onNewLocalTab(true),
    });
  }
  return items;
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

interface UseTabMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tabs: TerminalTabItem[];
  allProfiles: HostProfileSummaryDto[];
  isAppElevated: boolean;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (asAdmin?: boolean) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
  onDuplicateTab: (tab: TerminalTabItem) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}

export function useTabMenus(opts: UseTabMenusOpts) {
  const {
    t,
    tabs,
    allProfiles,
    isAppElevated,
    setContextMenu,
    onNewLocalTab,
    onReconnectTab,
    onToggleSftp,
    onOpenSftp,
    onDuplicateTab,
    onCloseTab,
    onCloseOtherTabs,
    onOpenPalette,
    onOpenSettings,
  } = opts;

  const openTabMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      const items: ContextMenuEntry[] = [
        {
          id: "tab-duplicate",
          label: t("ctx.duplicate_tab"),
          icon: <CopyPlus className="h-3.5 w-3.5" />,
          onSelect: () => onDuplicateTab(tab),
        },
      ];

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
        ...buildLaunchItems(t, isAppElevated, onNewLocalTab),
        { type: "separator", id: "sep-tab-2" },
        {
          id: "tab-close",
          label: t("ctx.close_tab"),
          icon: <X className="h-3.5 w-3.5" />,
          onSelect: () => onCloseTab(tab.tabId),
        }
      );

      if (tabs.length > 1) {
        items.push({
          id: "tab-close-others",
          label: t("ctx.close_other_tabs"),
          icon: <XCircle className="h-3.5 w-3.5" />,
          onSelect: () => onCloseOtherTabs(tab.tabId),
        });
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      allProfiles,
      isAppElevated,
      onCloseOtherTabs,
      onCloseTab,
      onDuplicateTab,
      onNewLocalTab,
      onOpenSftp,
      onReconnectTab,
      onToggleSftp,
      setContextMenu,
      t,
      tabs.length,
    ]
  );

  const openTabBarMenu = useCallback(
    (e: React.MouseEvent) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          ...buildLaunchItems(t, isAppElevated, onNewLocalTab),
          { type: "separator", id: "sep-tabbar" },
          {
            id: "tabbar-palette",
            label: t("ctx.quick_jump"),
            icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
            shortcut: "Ctrl+Shift+K",
            onSelect: onOpenPalette,
          },
          {
            id: "tabbar-settings",
            label: t("ctx.settings"),
            icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
            onSelect: onOpenSettings,
          },
        ],
      });
    },
    [isAppElevated, onNewLocalTab, onOpenPalette, onOpenSettings, setContextMenu, t]
  );

  return { openTabMenu, openTabBarMenu };
}
