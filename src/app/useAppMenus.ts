import React from "react";
import type { MenuState } from "@/shared/ui";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { useHostMenus, type HostProfileSummaryDto } from "@/modules/hosts";
import {
  useTerminalMenus,
  type NewLocalTabOpts,
  type TerminalContextActions,
} from "@/modules/terminal";
import { useGlobalContextMenu, useTabMenus } from "@/modules/workspace";

interface UseAppMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  tabs: TerminalTabItem[];
  allProfiles: HostProfileSummaryDto[];
  isAppElevated: boolean;
  isFullscreen?: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: NewLocalTabOpts) => void;
  onRenameTab: (tabId: string) => void;
  onFindInTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onToggleSftp: (tabId: string) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
  onDuplicateTab: (tab: TerminalTabItem) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onConnectHost: (host: HostProfileSummaryDto) => void;
  onEditHost: (hostId: string) => void;
  onDuplicateHost: (host: HostProfileSummaryDto) => void;
  onDeleteHost: (host: HostProfileSummaryDto) => void;
  onNewHost: (initialGroup?: string) => void;
  onOpenGroupModal: () => void;
  onDeleteGroup: (groupName: string) => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  onDismissSidebar: () => void;
  onRequestCloseWindow?: () => void;
  onExitFullscreen?: () => void;
  onWindowStateChange?: () => void;
}

export type { MenuState, TerminalContextActions };

/** Composes feature menu hooks and registers the global fallback context menu. */
export function useAppMenus(opts: UseAppMenusOpts) {
  const terminalMenus = useTerminalMenus({
    t: opts.t,
    isAppElevated: opts.isAppElevated,
    shellProfiles: opts.shellProfiles,
    defaultShellProfile: opts.defaultShellProfile,
    allProfiles: opts.allProfiles,
    setContextMenu: opts.setContextMenu,
    onNewLocalTab: opts.onNewLocalTab,
    onFindInTab: opts.onFindInTab,
    onReconnectTab: opts.onReconnectTab,
    onToggleSftp: opts.onToggleSftp,
    onOpenSftp: opts.onOpenSftp,
    onOpenSettings: opts.onOpenSettings,
    onCloseTab: opts.onCloseTab,
    isFullscreen: opts.isFullscreen,
    onExitFullscreen: opts.onExitFullscreen,
  });

  const tabMenus = useTabMenus({
    t: opts.t,
    tabs: opts.tabs,
    allProfiles: opts.allProfiles,
    isAppElevated: opts.isAppElevated,
    shellProfiles: opts.shellProfiles,
    defaultShellProfile: opts.defaultShellProfile,
    setContextMenu: opts.setContextMenu,
    onNewLocalTab: opts.onNewLocalTab,
    onRenameTab: opts.onRenameTab,
    onFindInTab: opts.onFindInTab,
    onReconnectTab: opts.onReconnectTab,
    onToggleSftp: opts.onToggleSftp,
    onOpenSftp: opts.onOpenSftp,
    onConnectHost: opts.onConnectHost,
    onDuplicateTab: opts.onDuplicateTab,
    onOpenSettings: opts.onOpenSettings,
    onCloseTab: opts.onCloseTab,
    onCloseOtherTabs: opts.onCloseOtherTabs,
    onRequestCloseWindow: opts.onRequestCloseWindow,
    onWindowStateChange: opts.onWindowStateChange,
  });

  const hostMenus = useHostMenus({
    t: opts.t,
    setContextMenu: opts.setContextMenu,
    onConnectHost: opts.onConnectHost,
    onOpenSftp: opts.onOpenSftp,
    onEditHost: opts.onEditHost,
    onDuplicateHost: opts.onDuplicateHost,
    onDeleteHost: opts.onDeleteHost,
    onNewHost: opts.onNewHost,
    onOpenGroupModal: opts.onOpenGroupModal,
    onDeleteGroup: opts.onDeleteGroup,
    onOpenVault: opts.onOpenVault,
    onOpenSettings: opts.onOpenSettings,
    onDismissSidebar: opts.onDismissSidebar,
  });

  useGlobalContextMenu({
    t: opts.t,
    isAppElevated: opts.isAppElevated,
    isFullscreen: opts.isFullscreen,
    shellProfiles: opts.shellProfiles,
    defaultShellProfile: opts.defaultShellProfile,
    setContextMenu: opts.setContextMenu,
    onNewLocalTab: opts.onNewLocalTab,
    onNewHost: opts.onNewHost,
    onOpenPalette: opts.onOpenPalette,
    onOpenSettings: opts.onOpenSettings,
    onExitFullscreen: opts.onExitFullscreen,
  });

  return {
    ...terminalMenus,
    ...tabMenus,
    ...hostMenus,
  };
}
