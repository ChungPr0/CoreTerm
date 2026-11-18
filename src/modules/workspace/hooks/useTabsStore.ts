import { create } from "zustand";
import type {
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";
import { isAutoReconnectAllowed, type HostFullConfigDto } from "@/modules/hosts";
import { loadSettings } from "@/modules/settings/settingsStorage";
import { DEFAULT_LOCAL_SHELL, createLocalTab, sftpToTabState } from "../utils/tabHelpers";

export type TabDisposeCallback = (tab: TerminalTabItem, hadSftp: boolean) => void;

interface TabsStoreState {
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  renamingTabId: string | null;
  openedSftpTabs: Record<string, boolean>;
  sftpModalByTab: Record<string, boolean>;
  setActiveTabId: (tabId: string | null) => void;
  startRenamingTab: (tabId: string) => void;
  cancelRenamingTab: () => void;
  renameTab: (tabId: string, title: string) => void;
  addTab: (tab: TerminalTabItem) => void;
  closeTab: (
    tabId: string,
    onDispose?: TabDisposeCallback,
    onEmpty?: () => void
  ) => void;
  closeOtherTabs: (keepTabId: string, onDispose?: TabDisposeCallback) => void;
  reorderTab: (tabId: string, toIndex: number) => void;
  bumpReconnectToken: (tabId: string) => void;
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

  setActiveTabId: (tabId) => set({ activeTabId: tabId }),

  startRenamingTab: (tabId) =>
    set((s) => {
      const target = s.tabs.find((t) => t.tabId === tabId);
      if (!target || target.hostId !== "local") return s;
      return { renamingTabId: tabId, activeTabId: tabId };
    }),

  cancelRenamingTab: () => set({ renamingTabId: null }),

  renameTab: (tabId, rawTitle) =>
    set((s) => {
      const nextTitle = rawTitle.trim();
      const target = s.tabs.find((t) => t.tabId === tabId);
      if (!target || target.hostId !== "local" || !nextTitle) {
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

    const nextTabs = state.tabs.filter((t) => t.tabId !== tabId);
    if (nextTabs.length === 0) {
      set({
        tabs: [],
        activeTabId: null,
        renamingTabId: null,
        openedSftpTabs: nextOpened,
        sftpModalByTab: nextModals,
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
    });
  },

  closeOtherTabs: (keepTabId, onDispose) => {
    const state = get();
    for (const tab of state.tabs) {
      if (tab.tabId !== keepTabId) {
        onDispose?.(tab, Boolean(state.openedSftpTabs[tab.tabId]));
      }
    }
    set({
      tabs: state.tabs.filter((t) => t.tabId === keepTabId),
      openedSftpTabs: state.openedSftpTabs[keepTabId] ? { [keepTabId]: true } : {},
      sftpModalByTab: state.sftpModalByTab[keepTabId] ? { [keepTabId]: true } : {},
      activeTabId: keepTabId,
      renamingTabId: state.renamingTabId === keepTabId ? keepTabId : null,
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

  bumpReconnectToken: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId
          ? {
              ...tab,
              state: "CONNECTING",
              errorMessage: null,
              reconnectToken: tab.reconnectToken + 1,
              ...(tab.tabKind === "sftp" ? { sftpState: "CONNECTING" as const } : {}),
            }
          : tab
      ),
    })),

  toggleSftpSplit: (tabId) =>
    set((s) => {
      const target = s.tabs.find((t) => t.tabId === tabId);
      if (!target || target.hostId === "local" || target.tabKind === "sftp") {
        return s;
      }
      const willOpen = !target.sftpOpen;
      return {
        openedSftpTabs:
          willOpen && !s.openedSftpTabs[tabId]
            ? { ...s.openedSftpTabs, [tabId]: true }
            : s.openedSftpTabs,
        tabs: s.tabs.map((tab) =>
          tab.tabId === tabId
            ? {
                ...tab,
                sftpOpen: willOpen,
                sftpState: willOpen ? tab.sftpState : "DISCONNECTED",
                sftpSplitRatio: tab.sftpSplitRatio ?? 0.45,
              }
            : tab
        ),
      };
    }),

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
              ...(tab.tabKind === "sftp" ? { state: sftpToTabState(sftpState) } : {}),
            }
          : tab
      ),
    })),

  updateSessionStatus: (tabId, state, errorMessage, activeForwards) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId
          ? { ...tab, state, errorMessage, activeForwards }
          : tab
      ),
    })),

  updateSessionAck: (tabId, isAdmin, shellProfile) =>
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (tab.tabId !== tabId) return tab;
        const shouldSyncTitle =
          shellProfile &&
          tab.hostId === "local" &&
          (!tab.shellProfile || tab.title === "Terminal" || tab.title === tab.shellProfile.name);
        return {
          ...tab,
          isAdmin,
          ...(shellProfile && tab.hostId === "local" ? { shellProfile } : {}),
          ...(shouldSyncTitle && shellProfile ? { title: shellProfile.name } : {}),
        };
      }),
    })),

  setTabShell: (tabId, shellProfile, reconnect = false) =>
    set((s) => ({
      tabs: s.tabs.map((tab) => {
        if (tab.tabId !== tabId || tab.hostId !== "local") return tab;
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
      }),
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
    set((s) => {
      const canAuto = isAutoReconnectAllowed(saved.auth_method, saved.password_mode);
      return {
        tabs: s.tabs.map((tab) =>
          tab.hostId === saved.id
            ? {
                ...tab,
                canAutoReconnect: canAuto,
                autoReconnect: canAuto ? saved.options.auto_reconnect : false,
                reconnectIntervalSec: saved.options.reconnect_interval_sec,
              }
            : tab
        ),
      };
    }),

  markLocalTabsAdmin: () =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.hostId === "local" ? { ...tab, isAdmin: true } : tab
      ),
    })),

  setLaunchDir: (dir: string) =>
    set((s) => ({
      tabs: s.tabs.map((tab, idx) =>
        idx === 0 && tab.hostId === "local"
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
    const existingLocal = get().tabs.find((t) => t.hostId === "local");
    const defaultShell =
      currentSettings.defaultShellProfile ??
      existingLocal?.shellProfile ??
      DEFAULT_LOCAL_SHELL;
    const isAdmin = get().tabs.some((t) => t.hostId === "local" && t.isAdmin);
    const newTab = createLocalTab(defaultShell, isAdmin);
    newTab.initialCwd = dir;

    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.tabId,
    }));
  },
}));
