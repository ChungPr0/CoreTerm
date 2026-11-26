import React, { useCallback } from "react";
import {
  Copy,
  CopyPlus,
  Edit2,
  FolderPlus,
  FolderSync,
  KeyRound,
  Play,
  Plus,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import { copyText } from "@/shared/utils/clipboard";
import { getShortcutChord } from "@/shared/utils/shortcuts";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import type { HostProfileSummaryDto } from "../types";

export interface BuildHostMenuItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  host: HostProfileSummaryDto;
  onConnectHost: (host: HostProfileSummaryDto) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
  onEditHost: (hostId: string) => void;
  onDuplicateHost: (host: HostProfileSummaryDto) => void;
  onCopyHost?: (hostAddress: string) => void;
  onDeleteHost: (host: HostProfileSummaryDto) => void;
  onDismissSidebar: () => void;
}

export function buildHostMenuItems({
  t,
  host,
  onConnectHost,
  onOpenSftp,
  onEditHost,
  onDuplicateHost,
  onCopyHost,
  onDeleteHost,
  onDismissSidebar,
}: BuildHostMenuItemsOpts): ContextMenuEntry[] {
  return [
    {
      id: "host-connect",
      label: t("common.connect"),
      icon: <Play className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: () => {
        onConnectHost(host);
        onDismissSidebar();
      },
    },
    {
      id: "host-open-sftp",
      label: t("ctx.sftp_open_tab"),
      icon: <FolderSync className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: () => {
        onOpenSftp(host);
        onDismissSidebar();
      },
    },
    {
      id: "host-edit",
      label: t("common.edit"),
      icon: <Edit2 className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: () => onEditHost(host.id),
    },
    {
      id: "host-duplicate",
      label: t("common.duplicate"),
      icon: <CopyPlus className="h-3.5 w-3.5" />,
      onSelect: () => onDuplicateHost(host),
    },
    {
      id: "host-copy-address",
      label: t("ctx.copy_host"),
      icon: <Copy className="h-3.5 w-3.5" />,
      onSelect: () => (onCopyHost ? onCopyHost(host.host) : void copyText(host.host)),
    },
    { type: "separator", id: "sep-host-1" },
    {
      id: "host-delete",
      label: t("common.delete"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      danger: true,
      onSelect: () => onDeleteHost(host),
    },
  ];
}

export interface BuildSidebarMenuItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  onNewHost: (initialGroup?: string) => void;
  onOpenGroupModal: () => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
}

export function buildSidebarMenuItems({
  t,
  onNewHost,
  onOpenGroupModal,
  onOpenVault,
  onOpenSettings,
}: BuildSidebarMenuItemsOpts): ContextMenuEntry[] {
  const kb = useSettingsStore.getState().settings.keybindings;
  return [
    {
      id: "sidebar-new-connection",
      label: t("ctx.new_connection"),
      icon: <Plus className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: () => onNewHost("Default"),
    },
    {
      id: "sidebar-new-group",
      label: t("ctx.new_group"),
      icon: <FolderPlus className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: onOpenGroupModal,
    },
    {
      id: "sidebar-key-vault",
      label: t("vault.title"),
      icon: <KeyRound className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: onOpenVault,
    },
    { type: "separator", id: "sep-sidebar" },
    {
      id: "sidebar-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: getShortcutChord("openSettings", kb),
      onSelect: onOpenSettings,
    },
  ];
}

export interface BuildGroupMenuItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  groupName: string;
  onNewHost: (initialGroup?: string) => void;
  onOpenGroupModal: () => void;
  onDeleteGroup: (groupName: string) => void;
  onOpenSettings: () => void;
}

export function buildGroupMenuItems({
  t,
  groupName,
  onNewHost,
  onOpenGroupModal,
  onDeleteGroup,
  onOpenSettings,
}: BuildGroupMenuItemsOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [
    {
      id: "group-new-connection",
      label: t("ctx.new_connection_in_group", { group: groupName }),
      icon: <Plus className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: () => onNewHost(groupName),
    },
    {
      id: "group-new-group",
      label: t("ctx.new_group"),
      icon: <FolderPlus className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: onOpenGroupModal,
    },
  ];
  if (groupName.trim().toLowerCase() !== "default") {
    items.push(
      { type: "separator", id: "sep-group-delete" },
      {
        id: "group-delete",
        label: t("ctx.delete_group"),
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => onDeleteGroup(groupName),
      }
    );
  }
  const kb = useSettingsStore.getState().settings.keybindings;
  items.push(
    { type: "separator", id: "sep-group-settings" },
    {
      id: "group-settings",
      label: t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: getShortcutChord("openSettings", kb),
      onSelect: onOpenSettings,
    }
  );
  return items;
}

interface UseHostMenusOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onConnectHost: (host: HostProfileSummaryDto) => void;
  onOpenSftp: (host: HostProfileSummaryDto) => void;
  onEditHost: (hostId: string) => void;
  onDuplicateHost: (host: HostProfileSummaryDto) => void;
  onDeleteHost: (host: HostProfileSummaryDto) => void;
  onNewHost: (initialGroup?: string) => void;
  onOpenGroupModal: () => void;
  onDeleteGroup: (groupName: string) => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
  onDismissSidebar: () => void;
}

export function useHostMenus(opts: UseHostMenusOpts) {
  const {
    t,
    setContextMenu,
    onConnectHost,
    onOpenSftp,
    onEditHost,
    onDuplicateHost,
    onDeleteHost,
    onNewHost,
    onOpenGroupModal,
    onDeleteGroup,
    onOpenVault,
    onOpenSettings,
    onDismissSidebar,
  } = opts;

  const openHostMenu = useCallback(
    (e: React.MouseEvent, host: HostProfileSummaryDto) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildHostMenuItems({
          t,
          host,
          onConnectHost,
          onOpenSftp,
          onEditHost,
          onDuplicateHost,
          onDeleteHost,
          onDismissSidebar,
        }),
      });
    },
    [
      onConnectHost,
      onDeleteHost,
      onDismissSidebar,
      onDuplicateHost,
      onEditHost,
      onOpenSftp,
      setContextMenu,
      t,
    ]
  );

  const openSidebarMenu = useCallback(
    (e: React.MouseEvent) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildSidebarMenuItems({
          t,
          onNewHost,
          onOpenGroupModal,
          onOpenVault,
          onOpenSettings,
        }),
      });
    },
    [onNewHost, onOpenGroupModal, onOpenSettings, onOpenVault, setContextMenu, t]
  );

  const openGroupMenu = useCallback(
    (e: React.MouseEvent, groupName: string) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildGroupMenuItems({
          t,
          groupName,
          onNewHost,
          onOpenGroupModal,
          onDeleteGroup,
          onOpenSettings,
        }),
      });
    },
    [onDeleteGroup, onNewHost, onOpenGroupModal, onOpenSettings, setContextMenu, t]
  );

  return { openHostMenu, openSidebarMenu, openGroupMenu };
}
