import { describe, expect, it, vi } from "vitest";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import {
  buildLaunchItems,
  buildTabBarContextItems,
  buildTabBarWindowMenu,
  buildTabContextItems,
} from "../tabMenus";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const PS: ShellProfile = {
  id: "powershell",
  kind: "powershell",
  name: "PowerShell",
  executable: "powershell.exe",
  args: ["-NoLogo"],
};

const CMD: ShellProfile = {
  id: "cmd",
  kind: "cmd",
  name: "CMD",
  executable: "cmd.exe",
  args: [],
};

describe("buildLaunchItems", () => {
  it("builds default, context admin, normal submenu, and admin submenu when unelevated", () => {
    const onNewLocalTab = vi.fn();
    const items = buildLaunchItems({
      t,
      isAppElevated: false,
      shellProfiles: [PS, CMD],
      defaultShellProfile: PS,
      contextShell: CMD,
      onNewLocalTab,
    });

    expect(items.map((i) => i.id)).toEqual([
      "new-tab",
      "new-admin-tab",
      "open-shell-submenu",
      "open-shell-admin-submenu",
    ]);

    const adminItem = items[1];
    expect(adminItem.type).not.toBe("separator");
    if (adminItem.type !== "separator") {
      expect(adminItem.label).toContain("CMD");
      expect(adminItem.highlight).toBe("admin");
      adminItem.onSelect?.();
    }
    expect(onNewLocalTab).toHaveBeenCalledWith({ profile: CMD, asAdmin: true });

    const adminSub = items[3];
    if (adminSub.type !== "separator") {
      expect(adminSub.children?.map((c) => c.id)).toEqual([
        "open-shell-admin-powershell",
        "open-shell-admin-cmd",
      ]);
      const cmdAdminChild = adminSub.children?.[1];
      if (cmdAdminChild && cmdAdminChild.type !== "separator") {
        cmdAdminChild.onSelect?.();
      }
    }
    expect(onNewLocalTab).toHaveBeenLastCalledWith({ profile: CMD, asAdmin: true });
  });

  it("forces admin launch entries when app is already elevated", () => {
    const onNewLocalTab = vi.fn();
    const items = buildLaunchItems({
      t,
      isAppElevated: true,
      shellProfiles: [PS, CMD],
      defaultShellProfile: PS,
      onNewLocalTab,
    });

    expect(items.map((i) => i.id)).toEqual([
      "new-tab",
      "open-shell-admin-submenu",
    ]);
    const newTab = items[0];
    if (newTab.type !== "separator") {
      newTab.onSelect?.();
    }
    expect(onNewLocalTab).toHaveBeenCalledWith({ profile: PS, asAdmin: true });
  });

  it("returns empty list safely when no local shell profiles exist", () => {
    const items = buildLaunchItems({
      t,
      isAppElevated: false,
      shellProfiles: [],
      defaultShellProfile: null,
      onNewLocalTab: vi.fn(),
    });
    expect(items).toEqual([]);
  });
});

describe("buildTabContextItems", () => {
  const baseTab = (overrides: Partial<TerminalTabItem>): TerminalTabItem => ({
    tabId: "t1",
    hostId: "local",
    title: "PowerShell",
    hostSubtitle: "Local",
    state: "ONLINE",
    errorMessage: null,
    reconnectToken: 0,
    ...overrides,
  });

  const HOST_PROFILE: HostProfileSummaryDto = {
    id: "h1",
    alias: "Prod Server",
    group_name: "Default",
    tags: [],
    host: "10.0.0.1",
    port: 22,
    username: "root",
    auth_method: "SSH_KEY",
    ssh_key_id: null,
    ssh_key_name: null,
    private_key_path: null,
    password_mode: "NONE",
    has_saved_password: false,
    auto_reconnect: false,
    reconnect_interval_sec: 5,
    active_port_forwards_count: 0,
    last_connected_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("includes Rename and Find for local shell tabs, omits Rename for SSH, omits both for SFTP", () => {
    const onRenameTab = vi.fn();
    const onFindInTab = vi.fn();
    const onOpenSettings = vi.fn();
    const common = {
      t,
      tabsCount: 2,
      allProfiles: [HOST_PROFILE],
      isAppElevated: false,
      shellProfiles: [PS, CMD],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onRenameTab,
      onFindInTab,
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSftp: vi.fn(),
      onConnectHost: vi.fn(),
      onDuplicateTab: vi.fn(),
      onOpenSettings,
      onCloseTab: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    };

    const localIds = buildTabContextItems({ ...common, tab: baseTab({ hostId: "local" }) }).map(
      (i) => i.id
    );
    expect(localIds).toContain("tab-rename");
    expect(localIds).toContain("tab-find");
    expect(localIds).toContain("tab-settings");
    expect(localIds).not.toContain("tab-ssh-open");

    const sshItems = buildTabContextItems({ ...common, tab: baseTab({ hostId: "h1" }) });
    const sshIds = sshItems.map((i) => i.id);
    expect(sshIds).not.toContain("tab-rename");
    expect(sshIds).toContain("tab-find");
    expect(sshIds).toContain("tab-sftp-split");
    expect(sshIds).toContain("tab-sftp-separate");
    expect(sshIds).toContain("tab-settings");
    expect(sshIds).not.toContain("tab-ssh-open");

    const findTabItem = sshItems.find((i) => i.id === "tab-find");
    expect(findTabItem && findTabItem.type !== "separator" && findTabItem.shortcut).toBe(
      "Ctrl+Shift+F"
    );
    const sftpSplitItem = sshItems.find((i) => i.id === "tab-sftp-split");
    expect(sftpSplitItem && sftpSplitItem.type !== "separator" && sftpSplitItem.shortcut).toBe(
      "Ctrl+Shift+E"
    );
    const settingsTabItem = sshItems.find((i) => i.id === "tab-settings");
    expect(settingsTabItem && settingsTabItem.type !== "separator" && settingsTabItem.shortcut).toBe(
      "Ctrl+,"
    );
    const closeTabItem = sshItems.find((i) => i.id === "tab-close");
    expect(closeTabItem && closeTabItem.type !== "separator" && closeTabItem.shortcut).toBe(
      "Ctrl+Shift+W"
    );

    const sftpIds = buildTabContextItems({
      ...common,
      tab: baseTab({ hostId: "h1", tabKind: "sftp" }),
    }).map((i) => i.id);
    expect(sftpIds).not.toContain("tab-rename");
    expect(sftpIds).not.toContain("tab-find");
    expect(sftpIds).not.toContain("tab-sftp-split");
    expect(sftpIds).not.toContain("tab-sftp-separate");
    expect(sftpIds).toContain("tab-ssh-open");
    expect(sftpIds).toContain("tab-settings");
  });

  it("unifies remote & local Editor tabs with launch, settings, and cross-tab actions", () => {
    const onConnectHost = vi.fn();
    const onOpenSftp = vi.fn();
    const onOpenSettings = vi.fn();
    const baseOpts = {
      t,
      tabsCount: 2,
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onRenameTab: vi.fn(),
      onFindInTab: vi.fn(),
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSftp,
      onConnectHost,
      onDuplicateTab: vi.fn(),
      onOpenSettings,
      onCloseTab: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    };

    const withProfile = buildTabContextItems({
      ...baseOpts,
      tabsCount: 1,
      allProfiles: [HOST_PROFILE],
      tab: baseTab({ hostId: "h1", tabKind: "sftp" }),
    });
    const openSshItem = withProfile.find((i) => i.id === "tab-ssh-open");
    expect(openSshItem).toBeDefined();
    if (openSshItem && openSshItem.type !== "separator") {
      expect(openSshItem.label).toBe("ctx.ssh_open_tab");
      openSshItem.onSelect?.();
    }
    expect(onConnectHost).toHaveBeenCalledTimes(1);
    expect(onConnectHost).toHaveBeenCalledWith(HOST_PROFILE);

    const withoutProfile = buildTabContextItems({
      ...baseOpts,
      tabsCount: 1,
      allProfiles: [],
      tab: baseTab({ hostId: "h1", tabKind: "sftp" }),
    });
    expect(withoutProfile.map((i) => i.id)).not.toContain("tab-ssh-open");

    const remoteEditorItems = buildTabContextItems({
      ...baseOpts,
      allProfiles: [HOST_PROFILE],
      tab: baseTab({
        hostId: "h1",
        tabKind: "editor",
        title: "nginx.conf",
        editorFile: {
          kind: "remote",
          path: "/etc/nginx/nginx.conf",
          name: "nginx.conf",
          hostLabel: "prod-1",
        },
      }),
    });
    expect(remoteEditorItems.map((i) => i.id)).toEqual([
      "tab-find",
      "tab-copy-path",
      "tab-reconnect",
      "tab-ssh-open",
      "tab-sftp-separate",
      "sep-tab-1",
      "new-tab",
      "new-admin-tab",
      "open-shell-submenu",
      "open-shell-admin-submenu",
      "sep-tab-2",
      "tab-settings",
      "tab-close",
      "tab-close-others",
    ]);

    const localEditorIds = buildTabContextItems({
      ...baseOpts,
      allProfiles: [HOST_PROFILE],
      tab: baseTab({
        hostId: "local",
        tabKind: "editor",
        title: "notes.txt",
        editorFile: {
          kind: "local",
          path: "C:\\notes.txt",
          name: "notes.txt",
          hostLabel: "Local",
        },
      }),
    }).map((i) => i.id);
    expect(localEditorIds).not.toContain("tab-reconnect");
    expect(localEditorIds).not.toContain("tab-ssh-open");
    expect(localEditorIds).toContain("tab-find");
    expect(localEditorIds).toContain("tab-copy-path");
    expect(localEditorIds).toContain("new-tab");
    expect(localEditorIds).toContain("tab-settings");
  });

  it("disables tab-reconnect while connecting or handshaking across remote tabs", () => {
    const common = {
      t,
      tabsCount: 1,
      allProfiles: [HOST_PROFILE],
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onRenameTab: vi.fn(),
      onFindInTab: vi.fn(),
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSftp: vi.fn(),
      onConnectHost: vi.fn(),
      onDuplicateTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    };

    for (const tab of [
      baseTab({ hostId: "h1", state: "CONNECTING" }),
      baseTab({ hostId: "h1", state: "HANDSHAKING" }),
      baseTab({ hostId: "h1", tabKind: "sftp", state: "CONNECTING" }),
      baseTab({
        hostId: "h1",
        tabKind: "editor",
        state: "CONNECTING",
        editorFile: { kind: "remote", path: "/a", name: "a", hostLabel: "h1" },
      }),
    ]) {
      const rec = buildTabContextItems({ ...common, tab }).find((i) => i.id === "tab-reconnect");
      expect(rec && rec.type !== "separator" && rec.disabled).toBe(true);
    }

    const onlineRec = buildTabContextItems({
      ...common,
      tab: baseTab({ hostId: "h1", state: "ONLINE" }),
    }).find((i) => i.id === "tab-reconnect");
    expect(onlineRec && onlineRec.type !== "separator" && onlineRec.disabled).toBe(false);
  });

  it("builds focused context menu for singleton settings tab without duplicate, rename, or redundant settings entry", () => {
    const onFindInTab = vi.fn();
    const items = buildTabContextItems({
      t,
      tabsCount: 2,
      allProfiles: [HOST_PROFILE],
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onRenameTab: vi.fn(),
      onFindInTab,
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSftp: vi.fn(),
      onConnectHost: vi.fn(),
      onDuplicateTab: vi.fn(),
      onOpenSettings: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      tab: baseTab({ tabId: "settings-1", hostId: "local", tabKind: "settings", title: "Settings" }),
    });

    const ids = items.map((i) => i.id);
    expect(ids).toContain("tab-find");
    expect(ids).toContain("new-tab");
    expect(ids).toContain("tab-close");
    expect(ids).toContain("tab-close-others");
    expect(ids).not.toContain("tab-duplicate");
    expect(ids).not.toContain("tab-rename");
    expect(ids).not.toContain("tab-reconnect");
    expect(ids).not.toContain("tab-settings");

    const findItem = items.find((i) => i.id === "tab-find");
    if (findItem && findItem.type !== "separator") {
      expect(findItem.shortcut).toBe("Ctrl+F");
      findItem.onSelect?.();
    }
    expect(onFindInTab).toHaveBeenCalledWith("settings-1");
  });
});

describe("buildTabBarWindowMenu and buildTabBarContextItems", () => {
  it("exposes standard Restore/Move/Minimize/Maximize/Close window controls", () => {
    const onAction = vi.fn();
    const normal = buildTabBarWindowMenu(t, false, onAction);
    expect(normal.map((i) => i.id)).toEqual([
      "win-restore",
      "win-move",
      "win-minimize",
      "win-maximize",
      "sep-win-close",
      "win-close",
    ]);

    expect(normal[0].type !== "separator" && normal[0].disabled).toBe(true);
    expect(normal[1].type !== "separator" && normal[1].disabled).toBe(false);
    expect(normal[3].type !== "separator" && normal[3].disabled).toBe(false);

    const maximized = buildTabBarWindowMenu(t, true, onAction);
    expect(maximized[0].type !== "separator" && maximized[0].disabled).toBe(false);
    expect(maximized[1].type !== "separator" && maximized[1].disabled).toBe(true);
    expect(maximized[3].type !== "separator" && maximized[3].disabled).toBe(true);

    const closeItem = maximized[5];
    if (closeItem.type !== "separator") {
      expect(closeItem.shortcut).toBe("Alt+F4");
      closeItem.onSelect?.();
    }
    expect(onAction).toHaveBeenCalledWith("close");
  });

  it("includes launch items, Settings, and window controls on TabBar blank space", () => {
    const onOpenSettings = vi.fn();
    const items = buildTabBarContextItems({
      t,
      isMaximized: false,
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onOpenSettings,
      onWindowAction: vi.fn(),
    });

    expect(items.map((i) => i.id)).toEqual([
      "new-tab",
      "new-admin-tab",
      "open-shell-submenu",
      "open-shell-admin-submenu",
      "tabbar-settings",
      "sep-tabbar-win",
      "win-restore",
      "win-move",
      "win-minimize",
      "win-maximize",
      "sep-win-close",
      "win-close",
    ]);

    const settingsItem = items.find((i) => i.id === "tabbar-settings");
    if (settingsItem && settingsItem.type !== "separator") {
      expect(settingsItem.shortcut).toBe("Ctrl+,");
      settingsItem.onSelect?.();
    }
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
