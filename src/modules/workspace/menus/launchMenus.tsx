import {
  FolderSync,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  Shield,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import type { ContextMenuEntry } from "@/shared/ui";
import type { WindowSysAction } from "../api/windowApi";
import type { ShellProfile, TerminalTabItem } from "../types";
import { ShellIcon } from "../components/ShellIcon";

export interface LocalTabLaunchOpts {
  profile?: ShellProfile;
  asAdmin?: boolean;
}

export interface BuildLaunchItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isAppElevated: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
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
    shellProfiles.length > 0
      ? shellProfiles
      : defaultShellProfile
      ? [defaultShellProfile]
      : [];
  const primaryDefault = defaultShellProfile ?? shells[0] ?? null;
  if (!primaryDefault || shells.length === 0) {
    return [];
  }

  const adminTarget = contextShell ?? primaryDefault;

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
        label: t("ctx.new_tab_admin_name", { name: primaryDefault.name }),
        icon: <ShellIcon profile={primaryDefault} />,
        highlight: "admin",
        shortcut: "Ctrl+Shift+T",
        onSelect: () =>
          onNewLocalTab({ profile: primaryDefault, asAdmin: true }),
      },
      adminSubmenu,
    ];
  }

  return [
    {
      id: "new-tab",
      label: t("ctx.new_tab_name", { name: primaryDefault.name }),
      icon: <ShellIcon profile={primaryDefault} />,
      shortcut: "Ctrl+Shift+T",
      onSelect: () =>
        onNewLocalTab({ profile: primaryDefault, asAdmin: false }),
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
