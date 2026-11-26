import { LOCAL_HOST_ID, SFTP_SPLIT_RATIO_DEFAULT } from "@/shared/defaults";
import type {
  EditorTabMeta,
  SettingsCategoryId,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";
import { normalizeEditorPathKey } from "@/shared/utils/path";
import { isAutoReconnectAllowed, type HostFullConfigDto } from "@/modules/hosts";

export function findExistingEditorTab(
  tabs: TerminalTabItem[],
  meta: EditorTabMeta,
  resolvedHostId: string
): TerminalTabItem | undefined {
  const targetKey = normalizeEditorPathKey(meta.kind, meta.path);
  return tabs.find(
    (t) =>
      t.tabKind === "editor" &&
      t.editorFile?.kind === meta.kind &&
      t.hostId === resolvedHostId &&
      normalizeEditorPathKey(t.editorFile.kind, t.editorFile.path) === targetKey
  );
}

export interface EditorReconnectConfig {
  canAutoReconnect?: boolean;
  autoReconnect?: boolean;
  reconnectIntervalSec?: number;
}

export function buildNewEditorTab(
  tabId: string,
  meta: EditorTabMeta,
  resolvedHostId: string,
  reconnectConfig?: EditorReconnectConfig
): TerminalTabItem {
  const isRemote = meta.kind === "remote";
  const canAutoReconnect = isRemote ? reconnectConfig?.canAutoReconnect : false;
  const autoReconnect =
    isRemote && canAutoReconnect !== false ? Boolean(reconnectConfig?.autoReconnect) : false;
  return {
    tabId,
    hostId: resolvedHostId,
    title: meta.name,
    hostSubtitle: meta.path,
    state: isRemote ? "CONNECTING" : "ONLINE",
    ...(isRemote ? { sftpState: "CONNECTING" as const } : {}),
    errorMessage: null,
    reconnectToken: 0,
    canAutoReconnect,
    autoReconnect,
    reconnectIntervalSec: isRemote ? (reconnectConfig?.reconnectIntervalSec ?? 2) : 2,
    tabKind: "editor",
    editorFile: { ...meta, dirty: false },
  };
}

export function buildSettingsTab(
  tabId: string,
  section?: SettingsCategoryId
): TerminalTabItem {
  return {
    tabId,
    hostId: LOCAL_HOST_ID,
    title: "Settings",
    hostSubtitle: "CoreTerm",
    state: "ONLINE",
    errorMessage: null,
    reconnectToken: 0,
    canAutoReconnect: false,
    autoReconnect: false,
    reconnectIntervalSec: 2,
    tabKind: "settings",
    ...(section ? { settingsSection: section } : {}),
  };
}

export function applyToggleSftpSplit(
  tabs: TerminalTabItem[],
  openedSftpTabs: Record<string, boolean>,
  tabId: string
): { tabs: TerminalTabItem[]; openedSftpTabs: Record<string, boolean> } | null {
  const target = tabs.find((t) => t.tabId === tabId);
  if (
    !target ||
    target.hostId === LOCAL_HOST_ID ||
    target.tabKind === "sftp" ||
    target.tabKind === "editor" ||
    target.tabKind === "settings"
  ) {
    return null;
  }
  const willOpen = !target.sftpOpen;
  return {
    openedSftpTabs:
      willOpen && !openedSftpTabs[tabId]
        ? { ...openedSftpTabs, [tabId]: true }
        : openedSftpTabs,
    tabs: tabs.map((tab) =>
      tab.tabId === tabId
        ? {
            ...tab,
            sftpOpen: willOpen,
            sftpState: willOpen ? tab.sftpState : "DISCONNECTED",
            sftpSplitRatio: tab.sftpSplitRatio ?? SFTP_SPLIT_RATIO_DEFAULT,
          }
        : tab
    ),
  };
}

export function applyUpdateSessionAck(
  tabs: TerminalTabItem[],
  tabId: string,
  isAdmin: boolean,
  shellProfile?: ShellProfile | null
): TerminalTabItem[] {
  return tabs.map((tab) => {
    if (tab.tabId !== tabId) return tab;
    const shouldSyncTitle =
      shellProfile &&
      tab.hostId === LOCAL_HOST_ID &&
      (!tab.shellProfile || tab.title === "Terminal" || tab.title === tab.shellProfile.name);
    return {
      ...tab,
      isAdmin,
      ...(shellProfile && tab.hostId === LOCAL_HOST_ID ? { shellProfile } : {}),
      ...(shouldSyncTitle && shellProfile ? { title: shellProfile.name } : {}),
    };
  });
}

export function applySetTabShell(
  tabs: TerminalTabItem[],
  tabId: string,
  shellProfile: ShellProfile,
  reconnect: boolean
): TerminalTabItem[] {
  return tabs.map((tab) => {
    if (tab.tabId !== tabId || tab.hostId !== LOCAL_HOST_ID) return tab;
    const shouldSyncTitle =
      !tab.shellProfile || tab.title === "Terminal" || tab.title === tab.shellProfile.name;
    return {
      ...tab,
      shellProfile,
      ...(shouldSyncTitle ? { title: shellProfile.name } : {}),
      ...(reconnect
        ? {
            state: "CONNECTING" as const,
            errorMessage: null,
            reconnectToken: tab.reconnectToken + 1,
          }
        : {}),
    };
  });
}

export type WindowCloseDecision =
  | { action: "prompt_dirty_editor"; tabId: string }
  | { action: "prompt_multi_tabs"; count: number }
  | { action: "close_now" };

/** Determines whether closing the window must first prompt unsaved editors or multi-tab confirmation. */
export function planWindowClose(
  tabs: TerminalTabItem[],
  warnCloseMultiTabs: boolean
): WindowCloseDecision {
  const dirtyEditor = tabs.find(
    (t) => t.tabKind === "editor" && Boolean(t.editorFile?.dirty)
  );
  if (dirtyEditor) {
    return { action: "prompt_dirty_editor", tabId: dirtyEditor.tabId };
  }
  if (warnCloseMultiTabs && tabs.length > 1) {
    return { action: "prompt_multi_tabs", count: tabs.length };
  }
  return { action: "close_now" };
}

export function applySyncHostConfig(
  tabs: TerminalTabItem[],
  saved: HostFullConfigDto
): TerminalTabItem[] {
  const canAuto = isAutoReconnectAllowed(saved.auth_method, saved.password_mode);
  return tabs.map((tab) =>
    tab.hostId === saved.id
      ? {
          ...tab,
          canAutoReconnect: canAuto,
          autoReconnect: canAuto ? saved.options.auto_reconnect : false,
          reconnectIntervalSec: saved.options.reconnect_interval_sec,
        }
      : tab
  );
}
