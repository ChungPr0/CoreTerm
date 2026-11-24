import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalTabItem } from "@/shared/types/ipc";
import {
  hydrateSnapshotTabs,
  loadSessionSnapshot,
  saveSessionSnapshot,
  serializeSessionSnapshot,
} from "../sessionStorage";

function makeTabs(): TerminalTabItem[] {
  return [
    {
      tabId: "settings-1",
      hostId: "local",
      title: "Settings",
      hostSubtitle: "CoreTerm",
      state: "ONLINE",
      reconnectToken: 0,
      tabKind: "settings",
    },
    {
      tabId: "local-1",
      hostId: "local",
      title: "Dev API",
      hostSubtitle: "PowerShell",
      initialCwd: "D:\\Workspace\\Project",
      shellProfile: {
        id: "pwsh",
        kind: "pwsh",
        name: "PowerShell 7",
        executable: "pwsh.exe",
        args: ["-NoLogo"],
      },
      state: "ONLINE",
      reconnectToken: 0,
    },
    {
      tabId: "ssh-1",
      hostId: "host-a",
      title: "Prod Web",
      hostSubtitle: "root@10.0.0.10:22",
      state: "ONLINE",
      sftpOpen: true,
      sftpSplitRatio: 0.52,
      canAutoReconnect: true,
      autoReconnect: true,
      reconnectIntervalSec: 5,
      reconnectToken: 1,
    },
    {
      tabId: "sftp-deleted",
      hostId: "host-gone",
      title: "Old Host",
      hostSubtitle: "root@10.0.0.99:22",
      state: "ONLINE",
      sftpState: "CONNECTED",
      tabKind: "sftp",
      reconnectToken: 0,
    },
    {
      tabId: "editor-local",
      hostId: "local",
      title: "hosts",
      hostSubtitle: "C:\\Windows\\System32\\drivers\\etc\\hosts",
      state: "ONLINE",
      tabKind: "editor",
      editorFile: {
        kind: "local",
        path: "C:\\Windows\\System32\\drivers\\etc\\hosts",
        name: "hosts",
        hostLabel: "Local",
        dirty: true,
      },
      reconnectToken: 0,
    },
    {
      tabId: "editor-remote",
      hostId: "host-a",
      title: "nginx.conf",
      hostSubtitle: "/etc/nginx/nginx.conf",
      state: "ONLINE",
      tabKind: "editor",
      editorFile: {
        kind: "remote",
        path: "/etc/nginx/nginx.conf",
        name: "nginx.conf",
        hostLabel: "Prod Web",
      },
      reconnectToken: 0,
    },
  ];
}

describe("sessionStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes restorable tabs, omits settings and remote editors, and tracks activeIndex", () => {
    const tabs = makeTabs();
    const snapshot = serializeSessionSnapshot(tabs, "ssh-1");
    expect(snapshot.version).toBe(1);
    expect(snapshot.activeIndex).toBe(1);
    expect(snapshot.tabs.map((t) => t.kind)).toEqual([
      "local_term",
      "ssh_term",
      "sftp",
      "local_editor",
    ]);
    expect(snapshot.tabs[0]).toMatchObject({
      kind: "local_term",
      title: "Dev API",
      initialCwd: "D:\\Workspace\\Project",
    });
    expect(snapshot.tabs[1]).toMatchObject({
      kind: "ssh_term",
      hostId: "host-a",
      sftpOpen: true,
      sftpSplitRatio: 0.52,
    });
  });

  it("saves and reloads snapshot cleanly while rejecting malformed JSON", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    });

    const tabs = makeTabs();
    saveSessionSnapshot(tabs, "editor-local");
    const loaded = loadSessionSnapshot();
    expect(loaded).not.toBeNull();
    expect(loaded?.activeIndex).toBe(3);
    expect(loaded?.tabs).toHaveLength(4);

    const hydrated = hydrateSnapshotTabs(loaded!, {
      validHostIds: new Set(["host-a"]),
      isAppElevated: true,
    });
    expect(hydrated).not.toBeNull();
    expect(hydrated?.tabs).toHaveLength(3);
    expect(hydrated?.tabs[0]).toMatchObject({
      hostId: "local",
      title: "Dev API",
      initialCwd: "D:\\Workspace\\Project",
      isAdmin: true,
    });
    expect(hydrated?.tabs[1]).toMatchObject({
      hostId: "host-a",
      state: "CONNECTING",
      sftpOpen: true,
      sftpState: "CONNECTING",
    });
    expect(hydrated?.tabs[2]).toMatchObject({
      tabKind: "editor",
      state: "ONLINE",
    });
    expect(hydrated?.activeTabId).toBe(hydrated?.tabs[2].tabId);
    expect(Object.keys(hydrated?.openedSftpTabs ?? {})).toEqual([
      hydrated?.tabs[1].tabId,
    ]);

    store.set("coreterm_session_snapshot", "{bad-json");
    expect(loadSessionSnapshot()).toBeNull();
  });
});
