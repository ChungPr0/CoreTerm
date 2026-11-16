import { describe, expect, it, vi } from "vitest";
import { buildPaneMenu, buildToolbarMenu } from "../sftpMenus";

const t = (key: string) => key;

describe("sftpMenus", () => {
  it("provides a single Reconnect entry on SFTP toolbar right-click", () => {
    const onReconnect = vi.fn();
    const items = buildToolbarMenu({ t, onReconnect });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("sftp-reconnect");
    expect(items[0].type).not.toBe("separator");
    if (items[0].type !== "separator") {
      expect(items[0].label).toBe("sftp.reconnect");
      items[0].onSelect?.();
    }
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps file pane context menu unchanged without reconnect entries", () => {
    const items = buildPaneMenu({
      kind: "remote",
      cwd: "/home/user",
      item: null,
      selected: [],
      connected: true,
      showLocal: true,
      t,
      onOpenDir: vi.fn(),
      onTransfer: vi.fn(),
      onNewFolder: vi.fn(),
      onRename: vi.fn(),
      onCopyPath: vi.fn(),
      onDelete: vi.fn(),
      onRefresh: vi.fn(),
    });

    const ids = items.map((i) => i.id);
    expect(ids).not.toContain("sftp-reconnect");
    expect(ids).not.toContain("sftp-reconnect-tab");
  });
});
