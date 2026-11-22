import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalTabItem } from "@/shared/types/ipc";
import { createLocalTab } from "../../utils/tabHelpers";
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

  it("creates local tabs preserving ShellProfile metadata", () => {
    const gitBash = {
      id: "git-bash",
      kind: "git-bash",
      name: "Git Bash",
      executable: "C:\\Program Files\\Git\\bin\\bash.exe",
      args: ["--login", "-i"],
    };
    const tab = createLocalTab(gitBash, true);
    expect(tab.hostId).toBe("local");
    expect(tab.title).toBe("Git Bash");
    expect(tab.shellProfile).toEqual(gitBash);
    expect(tab.isAdmin).toBe(true);
  });

  it("allows renaming only local shell tabs with non-empty trimmed titles", () => {
    useTabsStore.setState({
      tabs: [
        makeTab({ tabId: "local-1", hostId: "local", title: "PowerShell" }),
        makeTab({ tabId: "ssh-1", hostId: "h1", title: "prod-ssh" }),
        makeTab({ tabId: "sftp-1", hostId: "h1", tabKind: "sftp", title: "SFTP" }),
      ],
      activeTabId: "local-1",
      renamingTabId: null,
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().startRenamingTab("ssh-1");
    expect(useTabsStore.getState().renamingTabId).toBeNull();

    useTabsStore.getState().startRenamingTab("local-1");
    expect(useTabsStore.getState().renamingTabId).toBe("local-1");

    useTabsStore.getState().renameTab("local-1", "   ");
    expect(useTabsStore.getState().tabs[0].title).toBe("PowerShell");
    expect(useTabsStore.getState().renamingTabId).toBeNull();

    useTabsStore.getState().renameTab("local-1", "  Build Shell  ");
    expect(useTabsStore.getState().tabs[0].title).toBe("Build Shell");

    useTabsStore.getState().renameTab("ssh-1", "Hacked");
    useTabsStore.getState().renameTab("sftp-1", "Hacked");
    expect(useTabsStore.getState().tabs[1].title).toBe("prod-ssh");
    expect(useTabsStore.getState().tabs[2].title).toBe("SFTP");
  });

  it("syncs resolved fallback shell from session ack and allows switching shell profile", () => {
    const autoTab = createLocalTab(null);
    expect(autoTab.title).toBe("Terminal");
    expect(autoTab.shellProfile).toBeUndefined();

    const cmdShell = {
      id: "cmd",
      kind: "cmd",
      name: "CMD",
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [],
    };
    const customShell = {
      id: "custom:1",
      kind: "custom",
      name: "Nushell",
      executable: "D:\\Tools\\nu.exe",
      args: [],
    };

    useTabsStore.setState({
      tabs: [autoTab],
      activeTabId: autoTab.tabId,
      renamingTabId: null,
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().updateSessionAck(autoTab.tabId, true, cmdShell);
    let current = useTabsStore.getState().tabs[0];
    expect(current.isAdmin).toBe(true);
    expect(current.title).toBe("CMD");
    expect(current.shellProfile).toEqual(cmdShell);

    useTabsStore.getState().setTabShell(autoTab.tabId, customShell, true);
    current = useTabsStore.getState().tabs[0];
    expect(current.shellProfile).toEqual(customShell);
    expect(current.title).toBe("Nushell");
    expect(current.reconnectToken).toBe(1);
    expect(current.state).toBe("CONNECTING");
  });

  it("enforces canAutoReconnect policy on toggleAutoReconnect and syncHostConfig", () => {
    useTabsStore.setState({
      tabs: [
        makeTab({ tabId: "t1", hostId: "h1", canAutoReconnect: false, autoReconnect: false }),
        makeTab({ tabId: "t2", hostId: "h2", canAutoReconnect: true, autoReconnect: false }),
      ],
      activeTabId: "t1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().toggleAutoReconnect("t1", true);
    expect(useTabsStore.getState().tabs[0].autoReconnect).toBe(false);

    useTabsStore.getState().toggleAutoReconnect("t2", true);
    expect(useTabsStore.getState().tabs[1].autoReconnect).toBe(true);

    // syncHostConfig with password prompt (should disable auto_reconnect)
    useTabsStore.getState().syncHostConfig({
      id: "h2",
      auth_method: "PASSWORD",
      password_mode: "PROMPT_EVERY_TIME",
      options: { auto_reconnect: true, reconnect_interval_sec: 5 } as any,
    } as any);

    const h2Tab = useTabsStore.getState().tabs.find((t) => t.tabId === "t2");
    expect(h2Tab?.canAutoReconnect).toBe(false);
    expect(h2Tab?.autoReconnect).toBe(false);
  });

  it("handles setLaunchDir and openDirectoryInTab properly", () => {
    useTabsStore.setState({
      tabs: [
        makeTab({
          tabId: "t1",
          hostId: "local",
          title: "PowerShell",
          shellProfile: {
            id: "pwsh",
            name: "PowerShell",
            kind: "powershell",
            executable: "powershell.exe",
            args: [],
          },
        }),
      ],
      activeTabId: "t1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().setLaunchDir("C:\\Projects\\my-app");
    expect(useTabsStore.getState().tabs[0].initialCwd).toBe("C:\\Projects\\my-app");
    expect(useTabsStore.getState().tabs[0].title).toBe("PowerShell");

    useTabsStore.getState().openDirectoryInTab("D:\\Workspace\\new-proj");
    const tabs = useTabsStore.getState().tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs[1].initialCwd).toBe("D:\\Workspace\\new-proj");
    expect(tabs[1].title).toBe("PowerShell");
    expect(tabs[1].hostSubtitle).toBe("Local");
    expect(useTabsStore.getState().activeTabId).toBe(tabs[1].tabId);

    // Debounce duplicate call with same directory does not create extra tab
    useTabsStore.getState().openDirectoryInTab("D:\\Workspace\\new-proj");
    expect(useTabsStore.getState().tabs).toHaveLength(2);
  });

  it("handles edge cases when closing or operating on non-existent tab IDs", () => {
    useTabsStore.setState({
      tabs: [makeTab({ tabId: "t1" }), makeTab({ tabId: "t2" })],
      activeTabId: "t1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    // Closing a non-existent tab should be a safe no-op
    useTabsStore.getState().closeTab("non-existent-id");
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useTabsStore.getState().activeTabId).toBe("t1");

    // closeOtherTabs with a non-existent target should not delete all tabs
    useTabsStore.getState().closeOtherTabs("non-existent-id");
    expect(useTabsStore.getState().tabs).toHaveLength(2);

    // Reordering a non-existent tab or invalid indices should be safe
    useTabsStore.getState().reorderTab("non-existent-id", 0);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t1", "t2"]);

    useTabsStore.getState().reorderTab("t1", -1);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t1", "t2"]);

    // Resizing SFTP split on non-existent tab is safe
    useTabsStore.getState().resizeSftpSplit("non-existent-id", 0.7);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t1", "t2"]);
  });

  it("activates adjacent tab smoothly when closing middle tab", () => {
    useTabsStore.setState({
      tabs: [makeTab({ tabId: "t1" }), makeTab({ tabId: "t2" }), makeTab({ tabId: "t3" })],
      activeTabId: "t2",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().closeTab("t2");
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t1", "t3"]);
    // Should focus either the next tab (t3) or previous (t1)
    expect(["t1", "t3"]).toContain(useTabsStore.getState().activeTabId);
  });

  it("manages SFTP modal open and close states per tab", () => {
    useTabsStore.setState({
      tabs: [makeTab({ tabId: "t1" }), makeTab({ tabId: "t2" })],
      activeTabId: "t1",
      openedSftpTabs: {},
      sftpModalByTab: {},
    });

    useTabsStore.getState().setSftpModalOpen("t1", true);
    expect(useTabsStore.getState().sftpModalByTab["t1"]).toBe(true);
    expect(useTabsStore.getState().sftpModalByTab["t2"]).toBeUndefined();

    useTabsStore.getState().setSftpModalOpen("t1", false);
    expect(useTabsStore.getState().sftpModalByTab["t1"]).toBeUndefined();
  });

  it("opens independent parallel editor tabs, deduplicates same file, tracks dirty & SFTP state", () => {
    const id1 = useTabsStore.getState().openEditorTab(
      {
        kind: "remote",
        path: "/etc/nginx/nginx.conf",
        name: "nginx.conf",
        hostLabel: "prod-1",
      },
      "h1"
    );
    const id2 = useTabsStore.getState().openEditorTab(
      {
        kind: "remote",
        path: "/etc/hosts",
        name: "hosts",
        hostLabel: "prod-1",
      },
      "h1"
    );
    expect(id1).not.toBe(id2);
    expect(useTabsStore.getState().activeTabId).toBe(id2);
    expect(useTabsStore.getState().openedSftpTabs[id1]).toBe(true);

    const dupId = useTabsStore.getState().openEditorTab(
      {
        kind: "remote",
        path: "/etc/nginx/nginx.conf",
        name: "nginx.conf",
        hostLabel: "prod-1",
      },
      "h1"
    );
    expect(dupId).toBe(id1);
    expect(useTabsStore.getState().activeTabId).toBe(id1);

    useTabsStore.getState().setEditorDirty(id1, true);
    expect(useTabsStore.getState().tabs.find((t) => t.tabId === id1)?.editorFile?.dirty).toBe(true);

    useTabsStore.getState().startRenamingTab(id1);
    expect(useTabsStore.getState().renamingTabId).toBeNull();
    useTabsStore.getState().toggleSftpSplit(id1);
    expect(useTabsStore.getState().tabs.find((t) => t.tabId === id1)?.sftpOpen).toBeUndefined();

    useTabsStore.getState().setSftpState(id1, "CONNECTED");
    expect(useTabsStore.getState().tabs.find((t) => t.tabId === id1)?.state).toBe("ONLINE");

    useTabsStore.getState().closeTab("t1");
    expect(useTabsStore.getState().tabs.find((t) => t.tabId === id1)?.state).toBe("ONLINE");

    useTabsStore.getState().setSftpState(id1, "DISCONNECTED");
    expect(useTabsStore.getState().tabs.find((t) => t.tabId === id1)?.state).toBe("DISCONNECTED");
  });

  it("normalizes Windows local editor paths and guards dirty editor tabs on closeOtherTabs", () => {
    const localId = useTabsStore.getState().openEditorTab(
      {
        kind: "local",
        path: "C:\\Users\\Dev\\Config.json",
        name: "Config.json",
        hostLabel: "Local",
      },
      "local"
    );
    const sameLocalId = useTabsStore.getState().openEditorTab(
      {
        kind: "local",
        path: "c:/users/dev/config.json",
        name: "config.json",
        hostLabel: "Local",
      },
      "local"
    );
    expect(sameLocalId).toBe(localId);

    // Mark the local editor dirty and run closeOtherTabs keeping t1
    useTabsStore.getState().setEditorDirty(localId, true);
    const disposed: string[] = [];
    useTabsStore.getState().closeOtherTabs("t1", (tab) => disposed.push(tab.tabId));

    // t2 is closed, but dirty editor tab is preserved and prompted to close
    expect(disposed).toEqual(["t2"]);
    expect(useTabsStore.getState().tabs.map((t) => t.tabId)).toEqual(["t1", localId]);
    expect(useTabsStore.getState().activeTabId).toBe(localId);
    expect(useTabsStore.getState().editorCloseSeqByTab[localId]).toBe(1);
  });
});
