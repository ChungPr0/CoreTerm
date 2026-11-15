import { create } from "zustand";
import type {
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  TerminalTabItem,
} from "@/shared/types/ipc";
import type { HostFullConfigDto } from "@/modules/hosts";
import { createLocalTab, sftpToTabState } from "../utils/tabHelpers";

export type TabDisposeCallback = (tab: TerminalTabItem, hadSftp: boolean) => void;

interface TabsStoreState {
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  openedSftpTabs: Record<string, boolean>;
  sftpModalByTab: Record<string, boolean>;
  setActiveTabId: (tabId: string | null) => void;
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
  updateSessionAck: (tabId: string, isAdmin: boolean) => void;
  removeTabIfMultiple: (tabId: string) => void;
  toggleAutoReconnect: (tabId: string, enabled: boolean) => void;
  syncHostConfig: (saved: HostFullConfigDto) => void;
  markLocalTabsAdmin: () => void;
}

const initialTab = createLocalTab();

export const useTabsStore = create<TabsStoreState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.tabId,
  openedSftpTabs: {},
  sftpModalByTab: {},

  setActiveTabId: (tabId) => set({ activeTabId: tabId }),

  addTab: (tab) =>
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.tabId,
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

  updateSessionAck: (tabId, isAdmin) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId ? { ...tab, isAdmin } : tab
      ),
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
      return { tabs: nextTabs, activeTabId: nextActive };
    }),

  toggleAutoReconnect: (tabId, enabled) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.tabId === tabId ? { ...tab, autoReconnect: enabled } : tab
      ),
    })),

  syncHostConfig: (saved) =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.hostId === saved.id
          ? {
              ...tab,
              telemetryEnabled: saved.options.telemetry_enabled,
              autoReconnect: saved.options.auto_reconnect,
              reconnectIntervalSec: saved.options.reconnect_interval_sec,
            }
          : tab
      ),
    })),

  markLocalTabsAdmin: () =>
    set((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.hostId === "local" ? { ...tab, isAdmin: true } : tab
      ),
    })),
}));
