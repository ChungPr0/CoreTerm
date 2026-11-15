import React from "react";
import type { MenuState } from "@/shared/ui";
import type { TerminalTabItem } from "@/shared/types/ipc";
import type { AppSettingsValues } from "@/modules/settings";
import { useHostMenus, type HostProfileSummaryDto } from "@/modules/hosts";
import { useTerminalMenus, type TerminalContextActions } from "@/modules/terminal";
import { useGlobalContextMenu, useTabMenus } from "@/modules/workspace";

interface UseAppMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  settings: AppSettingsValues;
  tabs: TerminalTabItem[];
  allProfiles: HostProfileSummaryDto[];
  isAppElevated: boolean;
  hiddenTelemetryTabIds: Record<string, boolean>;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (asAdmin?: boolean) => void;
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
  onFocusTerminal: () => void;
  onShowTelemetry: (tabId: string) => void;
  onHideTelemetry: (tabId: string) => void;
}

export type { MenuState, TerminalContextActions };

/** Composes feature menu hooks and registers the global fallback context menu. */
export function useAppMenus(opts: UseAppMenusOpts) {
  const terminalMenus = useTerminalMenus({
    t: opts.t,
    settings: opts.settings,
    hiddenTelemetryTabIds: opts.hiddenTelemetryTabIds,
    setContextMenu: opts.setContextMenu,
    onReconnectTab: opts.onReconnectTab,
    onToggleSftp: opts.onToggleSftp,
    onShowTelemetry: opts.onShowTelemetry,
    onHideTelemetry: opts.onHideTelemetry,
    onFocusTerminal: opts.onFocusTerminal,
  });

  const tabMenus = useTabMenus({
    t: opts.t,
    tabs: opts.tabs,
    allProfiles: opts.allProfiles,
    isAppElevated: opts.isAppElevated,
    setContextMenu: opts.setContextMenu,
    onNewLocalTab: opts.onNewLocalTab,
    onReconnectTab: opts.onReconnectTab,
    onToggleSftp: opts.onToggleSftp,
    onOpenSftp: opts.onOpenSftp,
    onDuplicateTab: opts.onDuplicateTab,
    onCloseTab: opts.onCloseTab,
    onCloseOtherTabs: opts.onCloseOtherTabs,
    onOpenPalette: opts.onOpenPalette,
    onOpenSettings: opts.onOpenSettings,
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
    setContextMenu: opts.setContextMenu,
    onNewLocalTab: opts.onNewLocalTab,
    onNewHost: opts.onNewHost,
    onOpenPalette: opts.onOpenPalette,
    onOpenSettings: opts.onOpenSettings,
  });

  return {
    ...terminalMenus,
    ...tabMenus,
    ...hostMenus,
  };
}
