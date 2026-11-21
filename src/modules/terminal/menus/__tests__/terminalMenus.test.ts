import { describe, expect, it, vi } from "vitest";
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
  it("includes Settings with Ctrl+, shortcut and wires onOpenSettings", () => {
    const onOpenSettings = vi.fn();
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
    });

    const settingsItem = items.find((i) => i.id === "term-settings");
    expect(settingsItem).toBeDefined();
    if (settingsItem && settingsItem.type !== "separator") {
      expect(settingsItem.label).toBe("ctx.settings");
      expect(settingsItem.shortcut).toBe("Ctrl+,");
      settingsItem.onSelect?.();
    }
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    const selectAllItem = items.find((i) => i.id === "term-select-all");
    expect(selectAllItem).toBeDefined();
    if (selectAllItem && selectAllItem.type !== "separator") {
      expect(selectAllItem.shortcut).toBe("Ctrl+Shift+A");
    }

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
    });
  });

  it("includes Ctrl+Shift+E shortcut alongside ON/OFF badge on SSH SFTP Panel item", () => {
    const items = buildTerminalContextItems({
      t,
      tab: baseTab({ hostId: "h1", sftpOpen: true }),
      actions: baseActions(),
      isAppElevated: false,
      shellProfiles: [PS],
      defaultShellProfile: PS,
      onNewLocalTab: vi.fn(),
      onFindInTab: vi.fn(),
      onReconnectTab: vi.fn(),
      onToggleSftp: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    const sftpItem = items.find((i) => i.id === "term-sftp-split");
    expect(sftpItem).toBeDefined();
    if (sftpItem && sftpItem.type !== "separator") {
      expect(sftpItem.shortcut).toBe("Ctrl+Shift+E");
      expect(sftpItem.badge).toEqual({ text: "ctx.state_on", active: true });
    }
  });
});

describe("buildBannerContextItems", () => {
  it("includes Settings with Ctrl+, shortcut and optional Copy with Ctrl+C", () => {
    const onCopy = vi.fn();
    const onOpenSettings = vi.fn();
    const items = buildBannerContextItems({
      t,
      tab: baseTab({ hostId: "h1", state: "DISCONNECTED" }),
      selectedText: "err",
      onCopy,
      onReconnectTab: vi.fn(),
      onOpenSettings,
    });

    const copyItem = items.find((i) => i.id === "banner-copy");
    expect(copyItem && copyItem.type !== "separator" && copyItem.shortcut).toBe("Ctrl+C");

    const settingsItem = items.find((i) => i.id === "banner-settings");
    expect(settingsItem).toBeDefined();
    if (settingsItem && settingsItem.type !== "separator") {
      expect(settingsItem.shortcut).toBe("Ctrl+,");
      settingsItem.onSelect?.();
    }
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
