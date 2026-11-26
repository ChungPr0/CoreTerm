import { describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import type { HostProfileSummaryDto } from "../../types";
import {
  buildGroupMenuItems,
  buildHostMenuItems,
  buildSidebarMenuItems,
} from "../hostMenus";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const HOST: HostProfileSummaryDto = {
  id: "h1",
  alias: "Prod API",
  group_name: "Production",
  tags: ["web"],
  host: "10.10.1.25",
  port: 22,
  username: "deploy",
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

describe("hostMenus", () => {
  it("builds host item context menu including Copy Host / IP", () => {
    const onCopyHost = vi.fn();
    const items = buildHostMenuItems({
      t,
      host: HOST,
      onConnectHost: vi.fn(),
      onOpenSftp: vi.fn(),
      onEditHost: vi.fn(),
      onDuplicateHost: vi.fn(),
      onCopyHost,
      onDeleteHost: vi.fn(),
      onDismissSidebar: vi.fn(),
    });

    expect(items.map((i) => i.id)).toEqual([
      "host-connect",
      "host-open-sftp",
      "host-edit",
      "host-duplicate",
      "host-copy-address",
      "sep-host-1",
      "host-delete",
    ]);

    const copyHostItem = items.find((i) => i.id === "host-copy-address");
    if (copyHostItem && copyHostItem.type !== "separator") {
      copyHostItem.onSelect?.();
    }
    expect(onCopyHost).toHaveBeenCalledWith("10.10.1.25");
  });

  it("includes Settings footer on group menus and hides Delete Group only for Default", () => {
    const defaultItems = buildGroupMenuItems({
      t,
      groupName: "Default",
      onNewHost: vi.fn(),
      onOpenGroupModal: vi.fn(),
      onDeleteGroup: vi.fn(),
      onOpenSettings: vi.fn(),
    });
    expect(defaultItems.map((i) => i.id)).toEqual([
      "group-new-connection",
      "group-new-group",
      "sep-group-settings",
      "group-settings",
    ]);

    const customItems = buildGroupMenuItems({
      t,
      groupName: "Production",
      onNewHost: vi.fn(),
      onOpenGroupModal: vi.fn(),
      onDeleteGroup: vi.fn(),
      onOpenSettings: vi.fn(),
    });
    expect(customItems.map((i) => i.id)).toEqual([
      "group-new-connection",
      "group-new-group",
      "sep-group-delete",
      "group-delete",
      "sep-group-settings",
      "group-settings",
    ]);
  });

  it("builds sidebar background menu with new host, new group, vault, and settings", () => {
    const items = buildSidebarMenuItems({
      t,
      onNewHost: vi.fn(),
      onOpenGroupModal: vi.fn(),
      onOpenVault: vi.fn(),
      onOpenSettings: vi.fn(),
    });
    expect(items.map((i) => i.id)).toEqual([
      "sidebar-new-connection",
      "sidebar-new-group",
      "sidebar-key-vault",
      "sep-sidebar",
      "sidebar-settings",
    ]);
  });

  it("propagates custom openSettings shortcut into sidebar and group context menus", () => {
    const prevKb = useSettingsStore.getState().settings.keybindings;
    try {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, keybindings: { openSettings: "Ctrl+Alt+S" } },
      }));
      const sidebarSettings = buildSidebarMenuItems({
        t,
        onNewHost: vi.fn(),
        onOpenGroupModal: vi.fn(),
        onOpenVault: vi.fn(),
        onOpenSettings: vi.fn(),
      }).find((i) => i.id === "sidebar-settings");
      const groupSettings = buildGroupMenuItems({
        t,
        groupName: "Default",
        onNewHost: vi.fn(),
        onOpenGroupModal: vi.fn(),
        onDeleteGroup: vi.fn(),
        onOpenSettings: vi.fn(),
      }).find((i) => i.id === "group-settings");
      expect(
        sidebarSettings && sidebarSettings.type !== "separator" && sidebarSettings.shortcut
      ).toBe("Ctrl+Alt+S");
      expect(
        groupSettings && groupSettings.type !== "separator" && groupSettings.shortcut
      ).toBe("Ctrl+Alt+S");
    } finally {
      useSettingsStore.setState((s) => ({
        settings: { ...s.settings, keybindings: prevKb },
      }));
    }
  });
});
