import { describe, expect, it, vi } from "vitest";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import {
  buildBannerContextItems,
  buildTerminalContextItems,
} from "../terminalMenus";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const PS: ShellProfile = {
  id: "powershell",
  kind: "powershell",
  name: "PowerShell",
  executable: "powershell.exe",
  args: ["-NoLogo"],
};

const HOST_PROFILE: HostProfileSummaryDto = {
  id: "h1",
  alias: "Prod",
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

const baseTab = (overrides: Partial<TerminalTabItem> = {}): TerminalTabItem => ({
  tabId: "t1",
  hostId: "local",
  title: "PowerShell",
  hostSubtitle: "Local",
  state: "ONLINE",
  errorMessage: null,
  reconnectToken: 0,
  ...overrides,
});

const baseActions = () => ({
  hasSelection: true,
  copySelection: vi.fn().mockResolvedValue(undefined),
  pasteClipboard: vi.fn().mockResolvedValue(undefined),
  selectAll: vi.fn(),
  clear: vi.fn(),
  focus: vi.fn(),
});

describe("buildTerminalContextItems", () => {
  it("includes Settings, Close Tab shortcuts, and expected edit shortcuts", () => {
    const onOpenSettings = vi.fn();
    const onCloseTab = vi.fn();
    const items = buildTerminalContextItems({
      t,
      tab: baseTab(),
      actions: baseActions(),
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onFindInTab: vi.fn(),
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSettings,
      onCloseTab,
    });

    const settingsItem = items.find((i) => i.id === "term-settings");
    expect(settingsItem).toBeDefined();
    if (settingsItem && settingsItem.type !== "separator") {
      expect(settingsItem.label).toBe("ctx.settings");
      expect(settingsItem.shortcut).toBe("Ctrl+,");
      settingsItem.onSelect?.();
    }
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    const closeItem = items.find((i) => i.id === "term-close-tab");
    if (closeItem && closeItem.type !== "separator") {
      expect(closeItem.shortcut).toBe("Ctrl+Shift+W");
      closeItem.onSelect?.();
    }
    expect(onCloseTab).toHaveBeenCalledWith("t1");

    const shortcutsById = Object.fromEntries(
      items
        .filter((i): i is Extract<typeof i, { type?: "item" }> => i.type !== "separator" && Boolean(i.shortcut))
        .map((i) => [i.id, i.shortcut])
    );
    expect(shortcutsById).toEqual({
      "term-copy": "Ctrl+Shift+C",
      "term-paste": "Ctrl+Shift+V",
      "term-select-all": "Ctrl+Shift+A",
      "term-clear": "Ctrl+Shift+L",
      "term-find": "Ctrl+Shift+F",
      "new-tab": "Ctrl+Shift+T",
      "term-settings": "Ctrl+,",
      "term-close-tab": "Ctrl+Shift+W",
    });
  });

  it("includes SFTP Panel toggle, Open SFTP Tab, and disables Reconnect while connecting on SSH tabs", () => {
    const onOpenSftp = vi.fn();
    const items = buildTerminalContextItems({
      t,
      tab: baseTab({ hostId: "h1", state: "CONNECTING", sftpOpen: true }),
      actions: baseActions(),
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      allProfiles: [HOST_PROFILE],
      onNewLocalTab: vi.fn(),
      onFindInTab: vi.fn(),
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSftp,
      onOpenSettings: vi.fn(),
    });

    const reconnectItem = items.find((i) => i.id === "term-reconnect");
    expect(reconnectItem && reconnectItem.type !== "separator" && reconnectItem.disabled).toBe(true);

    const sftpItem = items.find((i) => i.id === "term-sftp-split");
    expect(sftpItem).toBeDefined();
    if (sftpItem && sftpItem.type !== "separator") {
      expect(sftpItem.shortcut).toBe("Ctrl+Shift+E");
      expect(sftpItem.badge).toEqual({ text: "ctx.state_on", active: true });
    }

    const openSftpItem = items.find((i) => i.id === "term-sftp-open");
    expect(openSftpItem).toBeDefined();
    if (openSftpItem && openSftpItem.type !== "separator") {
      openSftpItem.onSelect?.();
    }
    expect(onOpenSftp).toHaveBeenCalledWith(HOST_PROFILE);
  });
});

describe("buildBannerContextItems", () => {
  it("includes Copy, Reconnect state, SSH SFTP actions, Settings, and Close Tab", () => {
    const onCopy = vi.fn();
    const onOpenSettings = vi.fn();
    const onCloseTab = vi.fn();
    const onToggleSftp = vi.fn();
    const onOpenSftp = vi.fn();

    const items = buildBannerContextItems({
      t,
      tab: baseTab({ hostId: "h1", state: "HANDSHAKING", sftpOpen: false }),
      selectedText: "err",
      allProfiles: [HOST_PROFILE],
      onCopy,
      onReconnectTab: vi.fn(),
      onToggleSftp,
      onOpenSftp,
      onOpenSettings,
      onCloseTab,
    });

    const copyItem = items.find((i) => i.id === "banner-copy");
    expect(copyItem && copyItem.type !== "separator" && copyItem.shortcut).toBe("Ctrl+C");

    const reconnectItem = items.find((i) => i.id === "banner-reconnect");
    expect(reconnectItem && reconnectItem.type !== "separator" && reconnectItem.disabled).toBe(true);

    expect(items.map((i) => i.id)).toContain("banner-sftp-split");
    expect(items.map((i) => i.id)).toContain("banner-sftp-open");

    const settingsItem = items.find((i) => i.id === "banner-settings");
    if (settingsItem && settingsItem.type !== "separator") {
      expect(settingsItem.shortcut).toBe("Ctrl+,");
      settingsItem.onSelect?.();
    }
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    const closeItem = items.find((i) => i.id === "banner-close-tab");
    if (closeItem && closeItem.type !== "separator") {
      expect(closeItem.shortcut).toBe("Ctrl+Shift+W");
      closeItem.onSelect?.();
    }
    expect(onCloseTab).toHaveBeenCalledWith("t1");
  });

  it("reflects custom keybindings and exposes Exit Full Screen when fullscreen is active", () => {
    const prevKb = useSettingsStore.getState().settings.keybindings;
    const onExitFullscreen = vi.fn();
    try {
      useSettingsStore.setState((s) => ({
        settings: {
          ...s.settings,
          keybindings: {
            openSettings: "Ctrl+Alt+S",
            closeTab: "Ctrl+W",
            toggleFullscreen: "Alt+Enter",
          },
        },
      }));

      const termItems = buildTerminalContextItems({
        t,
        tab: baseTab(),
        actions: baseActions(),
        isAppElevated: false,
        shellProfiles: [PS],
        defaultShellProfile: PS,
        onNewLocalTab: vi.fn(),
        onFindInTab: vi.fn(),
        onReconnectTab: vi.fn(),
        onToggleSftp: vi.fn(),
        onOpenSettings: vi.fn(),
        onCloseTab: vi.fn(),
        isFullscreen: true,
        onExitFullscreen,
      });

      const exitFs = termItems.find((i) => i.id === "term-exit-fullscreen");
      expect(exitFs).toBeDefined();
      if (exitFs && exitFs.type !== "separator") {
        expect(exitFs.shortcut).toBe("Alt+Enter");
        exitFs.onSelect?.();
      }
      expect(onExitFullscreen).toHaveBeenCalledTimes(1);

      const bannerItems = buildBannerContextItems({
        t,
        tab: baseTab({ hostId: "h1", state: "DISCONNECTED" }),
        selectedText: "",
        onCopy: vi.fn(),
        onReconnectTab: vi.fn(),
        onOpenSettings: vi.fn(),
        onCloseTab: vi.fn(),
      });
      const bannerSettings = bannerItems.find((i) => i.id === "banner-settings");
      const bannerClose = bannerItems.find((i) => i.id === "banner-close-tab");
      expect(
        bannerSettings && bannerSettings.type !== "separator" && bannerSettings.shortcut
      ).toBe("Ctrl+Alt+S");
      expect(
        bannerClose && bannerClose.type !== "separator" && bannerClose.shortcut
      ).toBe("Ctrl+W");
    } finally {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, keybindings: prevKb },
      }));
    }
  });
});
