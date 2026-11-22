import { LOCAL_HOST_ID, SFTP_SPLIT_RATIO_DEFAULT } from "@/shared/defaults";
import type {
  EditorTabMeta,
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

export function buildNewEditorTab(
  tabId: string,
  meta: EditorTabMeta,
  resolvedHostId: string
): TerminalTabItem {
  const isRemote = meta.kind === "remote";
  return {
    tabId,
    hostId: resolvedHostId,
    title: meta.name,
    hostSubtitle: meta.path,
    state: isRemote ? "CONNECTING" : "ONLINE",
    ...(isRemote ? { sftpState: "CONNECTING" as const } : {}),
    errorMessage: null,
    reconnectToken: 0,
    tabKind: "editor",
    editorFile: { ...meta, dirty: false },
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
    target.tabKind === "editor"
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
