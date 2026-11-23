import { create } from "zustand";
import { LOCAL_HOST_ID } from "@/shared/defaults";
import { pathBaseName } from "@/shared/utils/path";
import type {
  EditorTabMeta,
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";
import type { HostFullConfigDto } from "@/modules/hosts";
import { loadSettings } from "@/modules/settings/settingsStorage";
import { DEFAULT_LOCAL_SHELL, createLocalTab, sftpToTabState } from "../utils/tabHelpers";
import {
  applySetTabShell,
  applySyncHostConfig,
  applyToggleSftpSplit,
  applyUpdateSessionAck,
  buildNewEditorTab,
  findExistingEditorTab,
} from "./tabsStoreHelpers";

export type TabDisposeCallback = (tab: TerminalTabItem, hadSftp: boolean) => void;

interface TabsStoreState {
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  renamingTabId: string | null;
  openedSftpTabs: Record<string, boolean>;
  sftpModalByTab: Record<string, boolean>;
  editorCloseSeqByTab: Record<string, number>;
  sftpRefreshSeqByHost: Record<string, number>;
  setActiveTabId: (tabId: string | null) => void;
  startRenamingTab: (tabId: string) => void;
  cancelRenamingTab: () => void;
  renameTab: (tabId: string, title: string) => void;
  addTab: (tab: TerminalTabItem) => void;
  openEditorTab: (meta: EditorTabMeta, hostId: string) => string;
  setEditorDirty: (tabId: string, dirty: boolean) => void;
  requestEditorClose: (tabId: string) => void;
  bumpSftpRefresh: (hostId: string) => void;
  closeTab: (
    tabId: string,
    onDispose?: TabDisposeCallback,
    onEmpty?: () => void
  ) => void;
  closeOtherTabs: (keepTabId: string, onDispose?: TabDisposeCallback) => void;
  reorderTab: (tabId: string, toIndex: number) => void;
  bumpReconnectToken: (tabId: string, source?: "tab" | "auto" | "banner") => void;
  toggleSftpSplit: (tabId: string) => void;
  resizeSftpSplit: (tabId: string, ratio: number) => void;
  setSftpModalOpen: (tabId: string, open: boolean) => void;
  setSftpState: (tabId: string, sftpState: SftpConnectionState) => void;
  updateSessionStatus: (
    tabId: string,
    state: SessionState,
    errorMessage: string | null,
    activeForwards: PortForwardStatusDto[]
  ) => void;
  updateSessionAck: (tabId: string, isAdmin: boolean, shellProfile?: ShellProfile | null) => void;
  setTabShell: (tabId: string, shellProfile: ShellProfile, reconnect?: boolean) => void;
  removeTabIfMultiple: (tabId: string) => void;
  toggleAutoReconnect: (tabId: string, enabled: boolean) => void;
  syncHostConfig: (saved: HostFullConfigDto) => void;
  markLocalTabsAdmin: () => void;
  setLaunchDir: (dir: string) => void;
  openDirectoryInTab: (dir: string) => void;
  openLocalFileInTab: (filePath: string, hostLabel: string) => string;
  openLaunchFiles: (
    files: string[],
    hostLabel: string,
    opts?: { replaceInitialLocal?: boolean; onDisposeTab?: (tabId: string) => void }
  ) => void;
}

const initialSettings = loadSettings();
const initialShell = initialSettings.defaultShellProfile ?? null;
const initialTab = createLocalTab(initialShell);

let lastOpenDir = "";
let lastOpenDirTime = 0;

export const useTabsStore = create<TabsStoreState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.tabId,
  renamingTabId: null,
  openedSftpTabs: {},
  sftpModalByTab: {},
  editorCloseSeqByTab: {},
  sftpRefreshSeqByHost: {},

  setActiveTabId: (tabId) => set({ activeTabId: tabId }),

  startRenamingTab: (tabId) =>
    set((s) => {
      const target = s.tabs.find((t) => t.tabId === tabId);
      if (!target || target.hostId !== LOCAL_HOST_ID || target.tabKind === "editor") return s;
      return { renamingTabId: tabId, activeTabId: tabId };
    }),

  cancelRenamingTab: () => set({ renamingTabId: null }),

  renameTab: (tabId, rawTitle) =>
    set((s) => {
      const nextTitle = rawTitle.trim();
      const target = s.tabs.find((t) => t.tabId === tabId);
      if (!target || target.hostId !== LOCAL_HOST_ID || target.tabKind === "editor" || !nextTitle) {
        return s.renamingTabId === tabId ? { renamingTabId: null } : s;
      }
      return {
        renamingTabId: s.renamingTabId === tabId ? null : s.renamingTabId,
        tabs: s.tabs.map((t) => (t.tabId === tabId ? { ...t, title: nextTitle } : t)),
      };
    }),

  addTab: (tab) =>
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.tabId,
      renamingTabId: null,
    })),

  openEditorTab: (meta, hostId) => {
    const resolvedHostId = meta.kind === "local" ? LOCAL_HOST_ID : hostId;
    const existing = findExistingEditorTab(get().tabs, meta, resolvedHostId);
    if (existing) {
      set({ activeTabId: existing.tabId, renamingTabId: null });
      return existing.tabId;
    }

    const tabId = crypto.randomUUID();
    const isRemote = meta.kind === "remote";
    const newTab = buildNewEditorTab(tabId, meta, resolvedHostId);
    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: tabId,
      renamingTabId: null,
      openedSftpTabs: isRemote ? { ...s.openedSftpTabs, [tabId]: true } : s.openedSftpTabs,
    }));
    return tabId;
  },

  setEditorDirty: (tabId, dirty) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.tabId === tabId && t.tabKind === "editor" && t.editorFile
          ? { ...t, editorFile: { ...t.editorFile, dirty } }
          : t
      ),
    })),

  requestEditorClose: (tabId) =>
    set((s) => ({
      activeTabId: tabId,
      editorCloseSeqByTab: {
        ...s.editorCloseSeqByTab,
        [tabId]: (s.editorCloseSeqByTab[tabId] ?? 0) + 1,
      },
    })),

  bumpSftpRefresh: (hostId) =>
    set((s) => ({
      sftpRefreshSeqByHost: {
        ...s.sftpRefreshSeqByHost,
        [hostId]: (s.sftpRefreshSeqByHost[hostId] ?? 0) + 1,
      },
    })),

  closeTab: (tabId, onDispose, onEmpty) => {
    const state = get();
    const target = state.tabs.find((t) => t.tabId === tabId);
    const hadSftp = Boolean(state.openedSftpTabs[tabId]);
    if (target) onDispose?.(target, hadSftp);

    const idx = state.tabs.findIndex((t) => t.tabId === tabId);
    if (idx === -1) return;

    const nextOpened = { ...state.openedSftpTabs };
    delete nextOpened[tabId];
    const nextModals = { ...state.sftpModalByTab };
    delete nextModals[tabId];
    const nextEditorClose = { ...state.editorCloseSeqByTab };
    delete nextEditorClose[tabId];

    const nextTabs = state.tabs.filter((t) => t.tabId !== tabId);
    if (nextTabs.length === 0) {
      set({
        tabs: [],
        activeTabId: null,
        renamingTabId: null,
        openedSftpTabs: nextOpened,
        sftpModalByTab: nextModals,
        editorCloseSeqByTab: nextEditorClose,
      });
      onEmpty?.();
      return;
    }

    const nextActive =
      state.activeTabId === tabId
        ? nextTabs[Math.min(idx, nextTabs.length - 1)].tabId
        : state.activeTabId;

    set({
      tabs: nextTabs,
      activeTabId: nextActive,
      renamingTabId: state.renamingTabId === tabId ? null : state.renamingTabId,
      openedSftpTabs: nextOpened,
      sftpModalByTab: nextModals,
      editorCloseSeqByTab: nextEditorClose,
    });
  },

  closeOtherTabs: (keepTabId, onDispose) => {
    const state = get();
    if (!state.tabs.some((t) => t.tabId === keepTabId)) {
      return;
    }
    const keptTabs: TerminalTabItem[] = [];
    const nextOpened: Record<string, boolean> = {};
    const nextModals: Record<string, boolean> = {};
    const nextEditorClose: Record<string, number> = {};
    let firstDirtyEditorId: string | null = null;

    for (const tab of state.tabs) {
      const isDirtyEditor =
        tab.tabId !== keepTabId && tab.tabKind === "editor" && Boolean(tab.editorFile?.dirty);
      if (tab.tabId === keepTabId || isDirtyEditor) {
        keptTabs.push(tab);
        if (state.openedSftpTabs[tab.tabId]) nextOpened[tab.tabId] = true;
        if (state.sftpModalByTab[tab.tabId]) nextModals[tab.tabId] = true;
        if (state.editorCloseSeqByTab[tab.tabId]) {
          nextEditorClose[tab.tabId] = state.editorCloseSeqByTab[tab.tabId];
        }
        if (isDirtyEditor && !firstDirtyEditorId) {
          firstDirtyEditorId = tab.tabId;
        }
      } else {
        onDispose?.(tab, Boolean(state.openedSftpTabs[tab.tabId]));
      }
    }

    if (firstDirtyEditorId) {
      nextEditorClose[firstDirtyEditorId] = (nextEditorClose[firstDirtyEditorId] ?? 0) + 1;
    }

    const targetActiveId = firstDirtyEditorId ?? keepTabId;
    set({
      tabs: keptTabs,
      openedSftpTabs: nextOpened,
      sftpModalByTab: nextModals,
      editorCloseSeqByTab: nextEditorClose,
      activeTabId: targetActiveId,
      renamingTabId: state.renamingTabId === targetActiveId ? targetActiveId : null,
    });
  },

  reorderTab: (tabId, toIndex) =>
    set((s) => {
      const fromIndex = s.tabs.findIndex((t) => t.tabId === tabId);
      if (
        fromIndex === -1 ||
        fromIndex === toIndex ||
        toIndex < 0 ||
        toIndex >= s.tabs.length
      ) {
        return s;
      }
      const next = [...s.tabs];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { tabs: next };
    }),

  bumpReconnectToken: (tabId, source = "tab") =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId
          ? {
              ...tab,
              state: "CONNECTING",
              errorMessage: null,
              reconnectToken: tab.reconnectToken + 1,
              reconnectSource: source,
              ...(tab.tabKind === "sftp" ||
              (tab.tabKind === "editor" && tab.editorFile?.kind === "remote")
                ? { sftpState: "CONNECTING" as const }
                : {}),
            }
          : tab
      ),
    })),

  toggleSftpSplit: (tabId) =>
    set((s) => applyToggleSftpSplit(s.tabs, s.openedSftpTabs, tabId) ?? s),

  resizeSftpSplit: (tabId, ratio) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId ? { ...tab, sftpSplitRatio: ratio } : tab
      ),
    })),

  setSftpModalOpen: (tabId, open) =>
    set((s) => {
      if (Boolean(s.sftpModalByTab[tabId]) === open) return s;
      const next = { ...s.sftpModalByTab };
      if (open) next[tabId] = true;
      else delete next[tabId];
      return { sftpModalByTab: next };
    }),

  setSftpState: (tabId, sftpState) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId
          ? {
              ...tab,
              sftpState,
              ...(sftpState === "CONNECTED" ? { reconnectSource: undefined } : {}),
              ...(tab.tabKind === "sftp" || tab.tabKind === "editor"
                ? { state: sftpToTabState(sftpState) }
                : {}),
            }
          : tab
      ),
    })),

  updateSessionStatus: (tabId, state, errorMessage, activeForwards) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId
          ? {
              ...tab,
              state,
              errorMessage,
              activeForwards,
              ...(state === "ONLINE" ? { reconnectSource: undefined } : {}),
            }
          : tab
      ),
    })),

  updateSessionAck: (tabId, isAdmin, shellProfile) =>
    set((s) => ({
      tabs: applyUpdateSessionAck(s.tabs, tabId, isAdmin, shellProfile),
    })),

  setTabShell: (tabId, shellProfile, reconnect = false) =>
    set((s) => ({
      tabs: applySetTabShell(s.tabs, tabId, shellProfile, reconnect),
    })),

  removeTabIfMultiple: (tabId) =>
    set((s) => {
      if (s.tabs.length <= 1) return s;
      const idx = s.tabs.findIndex((t) => t.tabId === tabId);
      const nextTabs = s.tabs.filter((t) => t.tabId !== tabId);
      const nextActive =
        s.activeTabId === tabId && nextTabs.length > 0
          ? nextTabs[Math.min(Math.max(idx, 0), nextTabs.length - 1)].tabId
          : s.activeTabId;
      return {
        tabs: nextTabs,
        activeTabId: nextActive,
        renamingTabId: s.renamingTabId === tabId ? null : s.renamingTabId,
      };
    }),

  toggleAutoReconnect: (tabId, enabled) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId
          ? {
              ...tab,
              autoReconnect: tab.canAutoReconnect !== false ? enabled : false,
            }
          : tab
      ),
    })),

  syncHostConfig: (saved) =>
    set((s) => ({
      tabs: applySyncHostConfig(s.tabs, saved),
    })),

  markLocalTabsAdmin: () =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.hostId === LOCAL_HOST_ID ? { ...tab, isAdmin: true } : tab
      ),
    })),

  setLaunchDir: (dir: string) =>
    set((s) => ({
      tabs: s.tabs.map((tab, idx) =>
        idx === 0 && tab.hostId === LOCAL_HOST_ID
          ? {
              ...tab,
              initialCwd: dir,
            }
          : tab
      ),
    })),

  openDirectoryInTab: (dir: string) => {
    const now = Date.now();
    if (dir === lastOpenDir && now - lastOpenDirTime < 800) {
      return;
    }
    lastOpenDir = dir;
    lastOpenDirTime = now;

    const currentSettings = loadSettings();
    const existingLocal = get().tabs.find((t) => t.hostId === LOCAL_HOST_ID);
    const defaultShell =
      currentSettings.defaultShellProfile ??
      existingLocal?.shellProfile ??
      DEFAULT_LOCAL_SHELL;
    const isAdmin = get().tabs.some((t) => t.hostId === LOCAL_HOST_ID && t.isAdmin);
    const newTab = createLocalTab(defaultShell, isAdmin);
    newTab.initialCwd = dir;

    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.tabId,
    }));
  },

  openLocalFileInTab: (filePath: string, hostLabel: string) => {
    const trimmed = filePath.trim();
    const name = pathBaseName(trimmed) || trimmed;
    return get().openEditorTab(
      {
        kind: "local",
        path: trimmed,
        name,
        hostLabel,
      },
      LOCAL_HOST_ID
    );
  },

  openLaunchFiles: (files, hostLabel, opts) => {
    const validFiles = files.map((f) => f.trim()).filter(Boolean);
    if (validFiles.length === 0) return;

    const currentTabs = get().tabs;
    const canReplaceInitial =
      Boolean(opts?.replaceInitialLocal) &&
      currentTabs.length === 1 &&
      currentTabs[0].hostId === LOCAL_HOST_ID &&
      currentTabs[0].tabKind !== "editor" &&
      currentTabs[0].tabKind !== "sftp";

    if (canReplaceInitial) {
      const initialTabId = currentTabs[0].tabId;
      const editorTabs: TerminalTabItem[] = [];
      for (const filePath of validFiles) {
        const meta: EditorTabMeta = {
          kind: "local",
          path: filePath,
          name: pathBaseName(filePath) || filePath,
          hostLabel,
        };
        if (findExistingEditorTab(editorTabs, meta, LOCAL_HOST_ID)) {
          continue;
        }
        editorTabs.push(buildNewEditorTab(crypto.randomUUID(), meta, LOCAL_HOST_ID));
      }
      if (editorTabs.length > 0) {
        set({
          tabs: editorTabs,
          activeTabId: editorTabs[editorTabs.length - 1].tabId,
          renamingTabId: null,
        });
        opts?.onDisposeTab?.(initialTabId);
        return;
      }
    }

    for (const filePath of validFiles) {
      get().openLocalFileInTab(filePath, hostLabel);
    }
  },
}));
