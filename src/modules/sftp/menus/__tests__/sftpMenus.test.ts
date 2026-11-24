import { describe, expect, it, vi } from "vitest";
import type { SftpTransferJobDto } from "../../types";
import {
  buildColumnHeaderMenu,
  buildPaneMenu,
  buildQueueMenu,
  buildSftpBannerMenu,
  buildSplitDividerMenu,
  buildToolbarMenu,
} from "../sftpMenus";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const baseJob = (overrides: Partial<SftpTransferJobDto> = {}): SftpTransferJobDto => ({
  job_id: "j1",
  tab_id: "t1",
  direction: "UPLOAD",
  source_path: "C:\\a\\file.txt",
  dest_path: "/home/user/file.txt",
  file_name: "file.txt",
  transferred_bytes: 50,
  total_bytes: 100,
  speed_bps: 1024,
  status: "RUNNING",
  ...overrides,
});

describe("sftpMenus", () => {
  it("builds complete toolbar menu for split and full modes and disables Reconnect while connecting", () => {
    const onReconnect = vi.fn();
    const onToggleLocalPane = vi.fn();
    const onOpenInTerminal = vi.fn();
    const onOpenSftpTab = vi.fn();
    const onOpenSshTab = vi.fn();
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();

    const splitItems = buildToolbarMenu({
      t,
      mode: "split",
      connState: "CONNECTING",
      showLocal: true,
      remoteCwd: "/var/log",
      onReconnect,
      onRefresh: vi.fn(),
      onToggleLocalPane,
      onCopyRemotePath: vi.fn(),
      onOpenInTerminal,
      onOpenSftpTab,
      onOpenSettings,
      onClose,
    });

    expect(splitItems.map((i) => i.id)).toEqual([
      "sftp-reconnect",
      "sftp-toolbar-refresh",
      "sftp-toolbar-local-pane",
      "sftp-toolbar-copy-cwd",
      "sftp-toolbar-open-term",
      "sftp-toolbar-open-sftp-tab",
      "sep-sftp-toolbar-common",
      "sftp-toolbar-settings",
      "sftp-toolbar-close",
    ]);

    const rec = splitItems[0];
    expect(rec.type !== "separator" && rec.disabled).toBe(true);
    const localPane = splitItems[2];
    expect(localPane.type !== "separator" && localPane.badge).toEqual({
      text: "ctx.state_on",
      active: true,
    });
    const closeSplit = splitItems[splitItems.length - 1];
    if (closeSplit.type !== "separator") {
      expect(closeSplit.label).toBe("ctx.close_sftp_panel");
      expect(closeSplit.shortcut).toBe("Ctrl+Shift+E");
    }

    const fullItems = buildToolbarMenu({
      t,
      mode: "full",
      connState: "CONNECTED",
      showLocal: false,
      remoteCwd: "/home/user",
      onReconnect,
      onToggleLocalPane,
      onCopyRemotePath: vi.fn(),
      onOpenSshTab,
      onOpenSettings,
      onClose,
    });

    expect(fullItems.map((i) => i.id)).toContain("sftp-toolbar-open-ssh");
    const closeFull = fullItems[fullItems.length - 1];
    if (closeFull.type !== "separator") {
      expect(closeFull.label).toBe("ctx.close_tab");
      expect(closeFull.shortcut).toBe("Ctrl+Shift+W");
    }
  });

  it("keeps file pane context menu free of reconnect entries", () => {
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

  it("includes New File, Select All, Clear Selection, Open in Terminal, and multi-select Copy Paths in pane menu", () => {
    const onSelectAll = vi.fn();
    const onClearSelection = vi.fn();
    const onOpenInTerminal = vi.fn();
    const onCopyPath = vi.fn();

    const emptyItems = buildPaneMenu({
      kind: "remote",
      mode: "split",
      cwd: "/home/user",
      item: null,
      selected: ["/home/user/a.txt"],
      hasItems: true,
      connected: true,
      showLocal: true,
      t,
      onOpenDir: vi.fn(),
      onTransfer: vi.fn(),
      onNewFile: vi.fn(),
      onNewFolder: vi.fn(),
      onRename: vi.fn(),
      onCopyPath,
      onSelectAll,
      onClearSelection,
      onOpenInTerminal,
      onDelete: vi.fn(),
      onRefresh: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });
    const emptyIds = emptyItems.map((i) => i.id);
    expect(emptyIds).toContain("remote-new-file");
    expect(emptyIds).toContain("remote-select-all");
    expect(emptyIds).toContain("remote-clear-selection");
    expect(emptyIds).toContain("remote-cwd-open-terminal");
    expect(emptyIds).toContain("remote-settings");
    expect(emptyIds).toContain("remote-close");

    const dirItem = {
      name: "nginx",
      path: "/etc/nginx",
      isDir: true,
      isSymlink: false,
      size: 0,
    };
    const dirMenu = buildPaneMenu({
      kind: "remote",
      cwd: "/etc",
      item: dirItem,
      selected: [dirItem.path],
      connected: true,
      showLocal: true,
      t,
      onOpenDir: vi.fn(),
      onOpenInTerminal,
      onTransfer: vi.fn(),
      onNewFolder: vi.fn(),
      onRename: vi.fn(),
      onCopyPath,
      onDelete: vi.fn(),
      onRefresh: vi.fn(),
    });
    const openTerm = dirMenu.find((i) => i.id === "remote-open-terminal");
    expect(openTerm).toBeDefined();
    if (openTerm && openTerm.type !== "separator") openTerm.onSelect?.();
    expect(onOpenInTerminal).toHaveBeenCalledWith("/etc/nginx");

    const multiMenu = buildPaneMenu({
      kind: "remote",
      cwd: "/etc",
      item: dirItem,
      selected: ["/etc/nginx", "/etc/b"],
      connected: true,
      showLocal: true,
      t,
      onOpenDir: vi.fn(),
      onTransfer: vi.fn(),
      onNewFolder: vi.fn(),
      onRename: vi.fn(),
      onCopyPath,
      onSelectAll,
      onDelete: vi.fn(),
      onRefresh: vi.fn(),
    });
    expect(multiMenu.map((i) => i.id)).toEqual([
      "remote-transfer-multi",
      "remote-copy-paths",
      "remote-select-all",
      "remote-refresh",
      "remote-multi-sep",
      "remote-delete-multi",
    ]);
    const copyPaths = multiMenu.find((i) => i.id === "remote-copy-paths");
    if (copyPaths && copyPaths.type !== "separator") copyPaths.onSelect?.();
    expect(onCopyPath).toHaveBeenCalledWith("/etc/nginx\n/etc/b");
  });

  it("never returns empty queue menu on empty footer and supports job row actions", () => {
    const onToggleExpand = vi.fn();
    const onCopyPath = vi.fn();
    const footerItems = buildQueueMenu({
      job: null,
      hasFinished: false,
      expanded: false,
      jobsCount: 0,
      mode: "full",
      isConnecting: false,
      canConnect: true,
      t,
      onPause: vi.fn(),
      onResume: vi.fn(),
      onCancel: vi.fn(),
      onClearFinished: vi.fn(),
      onToggleExpand,
      onReconnect: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });

    expect(footerItems.length).toBeGreaterThan(0);
    expect(footerItems.map((i) => i.id)).toEqual([
      "queue-toggle",
      "queue-clear",
      "sep-queue-common",
      "queue-reconnect",
      "queue-settings",
      "queue-close",
    ]);
    const clearItem = footerItems.find((i) => i.id === "queue-clear");
    expect(clearItem && clearItem.type !== "separator" && clearItem.disabled).toBe(true);

    const jobItems = buildQueueMenu({
      job: baseJob({ status: "RUNNING" }),
      hasFinished: true,
      t,
      onPause: vi.fn(),
      onResume: vi.fn(),
      onCancel: vi.fn(),
      onClearFinished: vi.fn(),
      onCopyPath,
    });
    expect(jobItems.map((i) => i.id)).toEqual([
      "queue-pause",
      "queue-cancel",
      "queue-copy-sep",
      "queue-copy-source",
      "queue-copy-dest",
      "queue-sep",
      "queue-clear",
    ]);
    const copySource = jobItems.find((i) => i.id === "queue-copy-source");
    if (copySource && copySource.type !== "separator") copySource.onSelect?.();
    expect(onCopyPath).toHaveBeenCalledWith("C:\\a\\file.txt");
  });

  it("builds column header, banner, and split divider context menus", () => {
    const onSort = vi.fn();
    const onResetCols = vi.fn();
    const colItems = buildColumnHeaderMenu({
      kind: "remote",
      connected: true,
      sortKey: "size",
      sortDir: "desc",
      t,
      onSort,
      onResetCols,
      onRefresh: vi.fn(),
    });
    expect(colItems.map((i) => i.id)).toEqual([
      "col-sort-name",
      "col-sort-size",
      "col-sort-mtime",
      "col-sep-1",
      "col-reset-widths",
      "col-refresh",
    ]);
    const sizeSort = colItems[1];
    expect(sizeSort.type !== "separator" && sizeSort.badge).toEqual({ text: "↓", active: true });

    const bannerItems = buildSftpBannerMenu({
      t,
      mode: "full",
      selectedText: "timeout",
      isConnecting: true,
      onCopy: vi.fn(),
      onReconnect: vi.fn(),
      onOpenSshTab: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });
    expect(bannerItems.map((i) => i.id)).toEqual([
      "sftp-banner-copy",
      "sep-sftp-banner-copy",
      "sftp-banner-reconnect",
      "sftp-banner-open-ssh",
      "sep-sftp-banner-common",
      "sftp-banner-settings",
      "sftp-banner-close",
    ]);
    const bannerRec = bannerItems.find((i) => i.id === "sftp-banner-reconnect");
    expect(bannerRec && bannerRec.type !== "separator" && bannerRec.disabled).toBe(true);

    const dividerItems = buildSplitDividerMenu({
      t,
      onResetSplit: vi.fn(),
      showLocal: true,
      onToggleLocalPane: vi.fn(),
      onOpenSftpTab: vi.fn(),
      onClosePanel: vi.fn(),
    });
    expect(dividerItems.map((i) => i.id)).toEqual([
      "sftp-split-reset",
      "sftp-split-toggle-local",
      "sftp-split-open-tab",
      "sep-split-close",
      "sftp-split-close",
    ]);
  });
});
