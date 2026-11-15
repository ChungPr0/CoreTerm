import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalTabItem } from "@/shared/types/ipc";
import { useTabsStore } from "../useTabsStore";

function makeTab(overrides: Partial<TerminalTabItem> = {}): TerminalTabItem {
  return {
    tabId: overrides.tabId ?? "t1",
    hostId: overrides.hostId ?? "h1",
    tabKind: overrides.tabKind ?? "terminal",
    title: overrides.title ?? "prod-1",
    hostSubtitle: overrides.hostSubtitle ?? "root@10.0.0.1",
    state: overrides.state ?? "ONLINE",
    errorMessage: null,
    reconnectToken: 0,
    autoReconnect: false,
    reconnectIntervalSec: 2,
    ...overrides,
  };
}

describe("useTabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({
      tabs: [makeTab({ tabId: "t1" }), makeTab({ tabId: "t2" })],
      activeTabId: "t1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });
  });

  it("adds tabs and focuses the new tab", () => {
    useTabsStore.getState().addTab(makeTab({ tabId: "t3" }));
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t1", "t2", "t3"]);
    expect(useTabsStore.getState().activeTabId).toBe("t3");
  });

  it("closes tabs, updates active tab, invokes dispose & onEmpty", () => {
    useTabsStore.getState().toggleSftpSplit("t1");
    useTabsStore.getState().setSftpModalOpen("t1", true);

    const disposed: Array<[string, boolean]> = [];
    const onEmpty = vi.fn();

    useTabsStore.getState().closeTab("t1", (tab, hadSftp) => disposed.push([tab.tabId, hadSftp]), onEmpty);
    expect(disposed).toEqual([["t1", true]]);
    expect(useTabsStore.getState().activeTabId).toBe("t2");
    expect(useTabsStore.getState().openedSftpTabs["t1"]).toBeUndefined();
    expect(useTabsStore.getState().sftpModalByTab["t1"]).toBeUndefined();
    expect(onEmpty).not.toHaveBeenCalled();

    useTabsStore.getState().closeTab("t2", undefined, onEmpty);
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().activeTabId).toBeNull();
  });

  it("closes other tabs cleanly while keeping split state of survivor", () => {
    useTabsStore.getState().addTab(makeTab({ tabId: "t3" }));
    useTabsStore.getState().toggleSftpSplit("t2");
    const closed: string[] = [];

    useTabsStore.getState().closeOtherTabs("t2", (tab) => closed.push(tab.tabId));
    expect(closed).toEqual(["t1", "t3"]);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t2"]);
    expect(useTabsStore.getState().activeTabId).toBe("t2");
    expect(useTabsStore.getState().openedSftpTabs).toEqual({ t2: true });
  });

  it("reorders tabs safely within bounds", () => {
    useTabsStore.getState().addTab(makeTab({ tabId: "t3" }));
    useTabsStore.getState().reorderTab("t1", 2);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t2", "t3", "t1"]);

    useTabsStore.getState().reorderTab("t2", 99);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t2", "t3", "t1"]);
  });

  it("toggles sftp split only on ssh terminal tabs and resizes split", () => {
    useTabsStore.setState({
      tabs: [
        makeTab({ tabId: "local-1", hostId: "local" }),
        makeTab({ tabId: "ssh-1", hostId: "h1" }),
        makeTab({ tabId: "sftp-1", hostId: "h1", tabKind: "sftp" }),
      ],
      activeTabId: "ssh-1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().toggleSftpSplit("local-1");
    useTabsStore.getState().toggleSftpSplit("sftp-1");
    expect(useTabsStore.getState().openedSftpTabs).toEqual({});

    useTabsStore.getState().toggleSftpSplit("ssh-1");
    const ssh = useTabsStore.getState().tabs.find((t) => t.tabId === "ssh-1");
    expect(ssh?.sftpOpen).toBe(true);
    expect(ssh?.sftpSplitRatio).toBe(0.45);
    expect(useTabsStore.getState().openedSftpTabs["ssh-1"]).toBe(true);

    useTabsStore.getState().resizeSftpSplit("ssh-1", 0.6);
    expect(useTabsStore.getState().tabs.find((t) => t.tabId === "ssh-1")?.sftpSplitRatio).toBe(0.6);
  });

  it("maps pure sftp connection state into tab status", () => {
    useTabsStore.setState({
      tabs: [makeTab({ tabId: "sftp-1", tabKind: "sftp", state: "CONNECTING" })],
      activeTabId: "sftp-1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().setSftpState("sftp-1", "CONNECTED");
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.sftpState).toBe("CONNECTED");
    expect(tab.state).toBe("ONLINE");
  });
});
