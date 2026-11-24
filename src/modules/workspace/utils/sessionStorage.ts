import { LOCAL_HOST_ID, SFTP_SPLIT_RATIO_DEFAULT } from "@/shared/defaults";
import type { EditorTabMeta, ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { buildNewEditorTab } from "../hooks/tabsStoreHelpers";
import { createLocalTab } from "./tabHelpers";

const SESSION_STORAGE_KEY = "coreterm_session_snapshot";
const MAX_RESTORE_TABS = 24;

export type SavedTabEntry =
  | {
      kind: "local_term";
      title: string;
      shellProfile?: ShellProfile;
      initialCwd?: string;
    }
  | {
      kind: "ssh_term";
      hostId: string;
      title: string;
      hostSubtitle: string;
      sftpOpen?: boolean;
      sftpSplitRatio?: number;
      canAutoReconnect?: boolean;
      autoReconnect?: boolean;
      reconnectIntervalSec?: number;
    }
  | {
      kind: "sftp";
      hostId: string;
      title: string;
      hostSubtitle: string;
      canAutoReconnect?: boolean;
      autoReconnect?: boolean;
      reconnectIntervalSec?: number;
    }
  | {
      kind: "local_editor";
      path: string;
      name: string;
      hostLabel: string;
    };

export interface SavedSessionSnapshot {
  version: 1;
  activeIndex: number;
  tabs: SavedTabEntry[];
}

function sanitizeShellProfile(raw: unknown): ShellProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const kind = typeof obj.kind === "string" ? obj.kind.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const executable = typeof obj.executable === "string" ? obj.executable.trim() : "";
  if (
    !id ||
    !kind ||
    !name ||
    !executable ||
    !Array.isArray(obj.args) ||
    !obj.args.every((a) => typeof a === "string")
  ) {
    return undefined;
  }
  return { id, kind, name, executable, args: obj.args };
}

function toSavedEntry(tab: TerminalTabItem): SavedTabEntry | null {
  if (tab.tabKind === "settings") return null;

  if (tab.tabKind === "editor") {
    if (tab.editorFile?.kind !== "local") return null;
    const path = tab.editorFile.path.trim();
    if (!path) return null;
    return {
      kind: "local_editor",
      path,
      name: tab.editorFile.name || tab.title,
      hostLabel: tab.editorFile.hostLabel,
    };
  }

  if (tab.tabKind === "sftp") {
    if (!tab.hostId || tab.hostId === LOCAL_HOST_ID) return null;
    return {
      kind: "sftp",
      hostId: tab.hostId,
      title: tab.title,
      hostSubtitle: tab.hostSubtitle,
      canAutoReconnect: tab.canAutoReconnect,
      autoReconnect: tab.autoReconnect,
      reconnectIntervalSec: tab.reconnectIntervalSec,
    };
  }

  if (tab.hostId === LOCAL_HOST_ID) {
    return {
      kind: "local_term",
      title: tab.title,
      ...(tab.shellProfile ? { shellProfile: tab.shellProfile } : {}),
      ...(tab.initialCwd ? { initialCwd: tab.initialCwd } : {}),
    };
  }

  return {
    kind: "ssh_term",
    hostId: tab.hostId,
    title: tab.title,
    hostSubtitle: tab.hostSubtitle,
    ...(tab.sftpOpen ? { sftpOpen: true } : {}),
    ...(typeof tab.sftpSplitRatio === "number"
      ? { sftpSplitRatio: tab.sftpSplitRatio }
      : {}),
    canAutoReconnect: tab.canAutoReconnect,
    autoReconnect: tab.autoReconnect,
    reconnectIntervalSec: tab.reconnectIntervalSec,
  };
}

export function serializeSessionSnapshot(
  tabs: TerminalTabItem[],
  activeTabId: string | null
): SavedSessionSnapshot {
  const savedTabs: SavedTabEntry[] = [];
  let activeIndex = 0;

  for (const tab of tabs) {
    if (savedTabs.length >= MAX_RESTORE_TABS) break;
    const entry = toSavedEntry(tab);
    if (!entry) continue;
    if (tab.tabId === activeTabId) {
      activeIndex = savedTabs.length;
    }
    savedTabs.push(entry);
  }

  return {
    version: 1,
    activeIndex: savedTabs.length > 0 ? Math.min(activeIndex, savedTabs.length - 1) : 0,
    tabs: savedTabs,
  };
}

export function saveSessionSnapshot(
  tabs: TerminalTabItem[],
  activeTabId: string | null
): void {
  try {
    const snapshot = serializeSessionSnapshot(tabs, activeTabId);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota or SSR/non-browser environments
  }
}

export function loadSessionSnapshot(): SavedSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tabs)) {
      return null;
    }
    const entries: SavedTabEntry[] = [];
    for (const item of parsed.tabs) {
      if (entries.length >= MAX_RESTORE_TABS || !item || typeof item !== "object") {
        continue;
      }
      const obj = item as Record<string, unknown>;
      if (obj.kind === "local_term") {
        const title = typeof obj.title === "string" && obj.title.trim() ? obj.title : "Terminal";
        const shellProfile = sanitizeShellProfile(obj.shellProfile);
        const initialCwd =
          typeof obj.initialCwd === "string" && obj.initialCwd.trim()
            ? obj.initialCwd
            : undefined;
        entries.push({
          kind: "local_term",
          title,
          ...(shellProfile ? { shellProfile } : {}),
          ...(initialCwd ? { initialCwd } : {}),
        });
      } else if (obj.kind === "ssh_term") {
        const hostId = typeof obj.hostId === "string" ? obj.hostId.trim() : "";
        if (!hostId || hostId === LOCAL_HOST_ID) continue;
        entries.push({
          kind: "ssh_term",
          hostId,
          title: typeof obj.title === "string" ? obj.title : hostId,
          hostSubtitle: typeof obj.hostSubtitle === "string" ? obj.hostSubtitle : "",
          sftpOpen: obj.sftpOpen === true,
          sftpSplitRatio:
            typeof obj.sftpSplitRatio === "number" &&
            obj.sftpSplitRatio > 0.15 &&
            obj.sftpSplitRatio < 0.85
              ? obj.sftpSplitRatio
              : undefined,
          canAutoReconnect: typeof obj.canAutoReconnect === "boolean" ? obj.canAutoReconnect : undefined,
          autoReconnect: typeof obj.autoReconnect === "boolean" ? obj.autoReconnect : false,
          reconnectIntervalSec:
            typeof obj.reconnectIntervalSec === "number" && obj.reconnectIntervalSec >= 1
              ? obj.reconnectIntervalSec
              : 2,
        });
      } else if (obj.kind === "sftp") {
        const hostId = typeof obj.hostId === "string" ? obj.hostId.trim() : "";
        if (!hostId || hostId === LOCAL_HOST_ID) continue;
        entries.push({
          kind: "sftp",
          hostId,
          title: typeof obj.title === "string" ? obj.title : hostId,
          hostSubtitle: typeof obj.hostSubtitle === "string" ? obj.hostSubtitle : "",
          canAutoReconnect: typeof obj.canAutoReconnect === "boolean" ? obj.canAutoReconnect : undefined,
          autoReconnect: typeof obj.autoReconnect === "boolean" ? obj.autoReconnect : false,
          reconnectIntervalSec:
            typeof obj.reconnectIntervalSec === "number" && obj.reconnectIntervalSec >= 1
              ? obj.reconnectIntervalSec
              : 2,
        });
      } else if (obj.kind === "local_editor") {
        const path = typeof obj.path === "string" ? obj.path.trim() : "";
        if (!path) continue;
        entries.push({
          kind: "local_editor",
          path,
          name: typeof obj.name === "string" && obj.name.trim() ? obj.name : path,
          hostLabel: typeof obj.hostLabel === "string" ? obj.hostLabel : "Local",
        });
      }
    }

    if (entries.length === 0) return null;
    const rawIdx = typeof parsed.activeIndex === "number" ? Math.round(parsed.activeIndex) : 0;
    const activeIndex = Math.max(0, Math.min(rawIdx, entries.length - 1));
    return {
      version: 1,
      activeIndex,
      tabs: entries,
    };
  } catch {
    return null;
  }
}

export function hydrateSnapshotTabs(
  snapshot: SavedSessionSnapshot,
  opts?: {
    validHostIds?: Set<string>;
    isAppElevated?: boolean;
  }
): {
  tabs: TerminalTabItem[];
  activeTabId: string;
  openedSftpTabs: Record<string, boolean>;
} | null {
  const restored: TerminalTabItem[] = [];
  const openedSftpTabs: Record<string, boolean> = {};
  let restoredActiveId: string | null = null;

  snapshot.tabs.forEach((entry, idx) => {
    let tab: TerminalTabItem | null = null;

    if (entry.kind === "local_term") {
      tab = createLocalTab(entry.shellProfile ?? null, opts?.isAppElevated ?? false);
      if (entry.title.trim()) tab.title = entry.title.trim();
      if (entry.initialCwd) tab.initialCwd = entry.initialCwd;
    } else if (entry.kind === "ssh_term") {
      if (opts?.validHostIds && !opts.validHostIds.has(entry.hostId)) {
        return;
      }
      const tabId = crypto.randomUUID();
      tab = {
        tabId,
        hostId: entry.hostId,
        title: entry.title,
        hostSubtitle: entry.hostSubtitle,
        state: "CONNECTING",
        errorMessage: null,
        reconnectToken: 0,
        canAutoReconnect: entry.canAutoReconnect,
        autoReconnect: entry.canAutoReconnect !== false ? Boolean(entry.autoReconnect) : false,
        reconnectIntervalSec: entry.reconnectIntervalSec ?? 2,
        sftpOpen: Boolean(entry.sftpOpen),
        ...(entry.sftpOpen
          ? {
              sftpState: "CONNECTING" as const,
              sftpSplitRatio: entry.sftpSplitRatio ?? SFTP_SPLIT_RATIO_DEFAULT,
            }
          : {}),
      };
      if (entry.sftpOpen) {
        openedSftpTabs[tabId] = true;
      }
    } else if (entry.kind === "sftp") {
      if (opts?.validHostIds && !opts.validHostIds.has(entry.hostId)) {
        return;
      }
      const tabId = crypto.randomUUID();
      tab = {
        tabId,
        hostId: entry.hostId,
        title: entry.title,
        hostSubtitle: entry.hostSubtitle,
        state: "CONNECTING",
        sftpState: "CONNECTING",
        tabKind: "sftp",
        errorMessage: null,
        reconnectToken: 0,
        canAutoReconnect: entry.canAutoReconnect,
        autoReconnect: entry.canAutoReconnect !== false ? Boolean(entry.autoReconnect) : false,
        reconnectIntervalSec: entry.reconnectIntervalSec ?? 2,
      };
      openedSftpTabs[tabId] = true;
    } else if (entry.kind === "local_editor") {
      const meta: EditorTabMeta = {
        kind: "local",
        path: entry.path,
        name: entry.name,
        hostLabel: entry.hostLabel,
      };
      tab = buildNewEditorTab(crypto.randomUUID(), meta, LOCAL_HOST_ID);
    }

    if (!tab) return;
    if (idx === snapshot.activeIndex) {
      restoredActiveId = tab.tabId;
    }
    restored.push(tab);
  });

  if (restored.length === 0) return null;
  return {
    tabs: restored,
    activeTabId: restoredActiveId ?? restored[0].tabId,
    openedSftpTabs,
  };
}
