import { describe, expect, it, vi } from "vitest";
import {
  buildEditorBannerMenu,
  buildEditorContextItems,
  buildEditorStatusBarMenu,
  buildEditorToolbarMenu,
} from "../editorMenus";

const t = (key: string, params?: Record<string, string | number>) => {
  if (params) {
    let str = key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{{${k}}}`, String(v));
    }
    return str;
  }
  return key;
};

function getItemDisabled(items: ReturnType<typeof buildEditorContextItems>, id: string): boolean | undefined {
  const entry = items.find((i) => i.id === id);
  return entry && "disabled" in entry ? entry.disabled : undefined;
}

describe("Editor Menus (Viewport, Toolbar, StatusBar, Banner)", () => {
  it("builds viewport context menu with EOL, remote session links, Settings, and Close Tab", () => {
    const onReplace = vi.fn();
    const onSave = vi.fn();
    const onToggleEol = vi.fn();
    const onOpenSshTab = vi.fn();
    const onOpenSftpTab = vi.fn();
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();

    const items = buildEditorContextItems({
      t,
      hasSelection: true,
      readonly: false,
      fileReadonly: false,
      isDirty: true,
      saving: false,
      loading: false,
      connecting: false,
      isRemoteConnecting: false,
      wordWrap: true,
      eol: "CRLF",
      isRemote: true,
      isDisconnected: false,
      onCut: vi.fn(),
      onCopy: vi.fn(),
      onPaste: vi.fn(),
      onSelectAll: vi.fn(),
      onFind: vi.fn(),
      onReplace,
      onGotoLine: vi.fn(),
      onToggleWordWrap: vi.fn(),
      onToggleReadonly: vi.fn(),
      onToggleEol,
      onSave,
      onReload: vi.fn(),
      onReconnect: vi.fn(),
      onCopyPath: vi.fn(),
      onOpenSshTab,
      onOpenSftpTab,
      onOpenSettings,
      onClose,
    });

    const replaceItem = items.find((i) => i.id === "editor-replace");
    expect(replaceItem && "shortcut" in replaceItem ? replaceItem.shortcut : undefined).toBe("Ctrl+H");

    const wordWrapItem = items.find((i) => i.id === "editor-word-wrap");
    expect(wordWrapItem && "badge" in wordWrapItem ? wordWrapItem.badge?.text : undefined).toBe("ctx.state_on");

    const eolItem = items.find((i) => i.id === "editor-eol");
    expect(eolItem && "badge" in eolItem ? eolItem.badge?.text : undefined).toBe("CRLF");

    expect(items.map((i) => i.id)).toContain("editor-open-ssh");
    expect(items.map((i) => i.id)).toContain("editor-open-sftp");

    const settingsItem = items.find((i) => i.id === "editor-settings");
    expect(settingsItem && "shortcut" in settingsItem ? settingsItem.shortcut : undefined).toBe("Ctrl+,");

    const closeItem = items.find((i) => i.id === "editor-close");
    expect(closeItem && "shortcut" in closeItem ? closeItem.shortcut : undefined).toBe("Ctrl+Shift+W");

    if (replaceItem && "onSelect" in replaceItem) replaceItem.onSelect?.();
    expect(onReplace).toHaveBeenCalledTimes(1);

    const saveItem = items.find((i) => i.id === "editor-save");
    if (saveItem && "onSelect" in saveItem) saveItem.onSelect?.();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables replace/paste/eol when readonly and disables reconnect while remote connecting", () => {
    const dummy = vi.fn();
    const items = buildEditorContextItems({
      t,
      hasSelection: true,
      readonly: true,
      fileReadonly: true,
      isDirty: true,
      saving: false,
      loading: false,
      connecting: false,
      isRemoteConnecting: true,
      wordWrap: false,
      eol: "LF",
      isRemote: true,
      isDisconnected: true,
      onCut: dummy,
      onCopy: dummy,
      onPaste: dummy,
      onSelectAll: dummy,
      onFind: dummy,
      onReplace: dummy,
      onGotoLine: dummy,
      onToggleWordWrap: dummy,
      onToggleReadonly: dummy,
      onToggleEol: dummy,
      onSave: dummy,
      onReload: dummy,
      onReconnect: dummy,
      onCopyPath: dummy,
    });

    expect(getItemDisabled(items, "editor-cut")).toBe(true);
    expect(getItemDisabled(items, "editor-copy")).toBe(false);
    expect(getItemDisabled(items, "editor-paste")).toBe(true);
    expect(getItemDisabled(items, "editor-replace")).toBe(true);
    expect(getItemDisabled(items, "editor-readonly")).toBe(true);
    expect(getItemDisabled(items, "editor-eol")).toBe(true);
    expect(getItemDisabled(items, "editor-reconnect")).toBe(true);
  });

  it("buildEditorToolbarMenu focuses on file, search, view, and common footer without text-edit clipboard items", () => {
    const dummy = vi.fn();
    const toolbarItems = buildEditorToolbarMenu({
      t,
      readonly: false,
      fileReadonly: false,
      isDirty: true,
      saving: false,
      loading: false,
      connecting: false,
      wordWrap: false,
      eol: "LF",
      isRemote: true,
      isDisconnected: false,
      onFind: dummy,
      onReplace: dummy,
      onGotoLine: dummy,
      onToggleWordWrap: dummy,
      onToggleReadonly: dummy,
      onToggleEol: dummy,
      onSave: dummy,
      onReload: dummy,
      onReconnect: dummy,
      onCopyPath: dummy,
      onOpenSshTab: dummy,
      onOpenSftpTab: dummy,
      onOpenSettings: dummy,
      onClose: dummy,
    });

    const ids = toolbarItems.map((i) => i.id);
    expect(ids).not.toContain("editor-cut");
    expect(ids).not.toContain("editor-copy");
    expect(ids).not.toContain("editor-paste");
    expect(ids).not.toContain("editor-select-all");
    expect(ids).toEqual([
      "editor-save",
      "editor-reload",
      "editor-reconnect",
      "editor-copy-path",
      "editor-open-ssh",
      "editor-open-sftp",
      "sep-toolbar-search",
      "editor-find",
      "editor-replace",
      "editor-goto",
      "sep-toolbar-view",
      "editor-word-wrap",
      "editor-readonly",
      "editor-eol",
      "sep-toolbar-close",
      "editor-settings",
      "editor-close",
    ]);
  });

  it("builds status bar menu with zoom controls, EOL toggle, view options, Settings, and Close Tab", () => {
    const onZoomReset = vi.fn();
    const items = buildEditorStatusBarMenu({
      t,
      editorReady: true,
      readonly: false,
      fileReadonly: false,
      wordWrap: false,
      eol: "LF",
      zoomPercent: 100,
      canZoomIn: true,
      canZoomOut: false,
      onGotoLine: vi.fn(),
      onToggleEol: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomReset,
      onToggleWordWrap: vi.fn(),
      onToggleReadonly: vi.fn(),
      onCopyPath: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });

    expect(items.map((i) => i.id)).toEqual([
      "status-goto",
      "status-eol",
      "sep-status-zoom",
      "status-zoom-in",
      "status-zoom-out",
      "status-zoom-reset",
      "sep-status-view",
      "status-word-wrap",
      "status-readonly",
      "sep-status-file",
      "status-copy-path",
      "status-settings",
      "status-close",
    ]);

    expect(getItemDisabled(items, "status-zoom-in")).toBe(false);
    expect(getItemDisabled(items, "status-zoom-out")).toBe(true);
    expect(getItemDisabled(items, "status-zoom-reset")).toBe(true);
  });

  it("builds reconnect banner menu for editor", () => {
    const items = buildEditorBannerMenu({
      t,
      selectedText: "network down",
      isConnecting: false,
      reloadDisabled: true,
      onCopy: vi.fn(),
      onReconnect: vi.fn(),
      onReload: vi.fn(),
      onOpenSettings: vi.fn(),
      onClose: vi.fn(),
    });

    expect(items.map((i) => i.id)).toEqual([
      "editor-banner-copy",
      "sep-editor-banner-copy",
      "editor-banner-reconnect",
      "editor-banner-reload",
      "sep-editor-banner-common",
      "editor-banner-settings",
      "editor-banner-close",
    ]);
    expect(getItemDisabled(items, "editor-banner-reload")).toBe(true);
  });

  it("disables editor actions while not ready and disables reload when retrying", () => {
    const dummy = vi.fn();
    const items = buildEditorContextItems({
      t,
      editorReady: false,
      hasSelection: true,
      readonly: false,
      fileReadonly: false,
      isDirty: true,
      saving: false,
      loading: false,
      retrying: true,
      connecting: false,
      wordWrap: false,
      isRemote: false,
      isDisconnected: false,
      onCut: dummy,
      onCopy: dummy,
      onPaste: dummy,
      onSelectAll: dummy,
      onFind: dummy,
      onReplace: dummy,
      onGotoLine: dummy,
      onToggleWordWrap: dummy,
      onToggleReadonly: dummy,
      onSave: dummy,
      onReload: dummy,
      onCopyPath: dummy,
    });

    for (const id of [
      "editor-cut",
      "editor-copy",
      "editor-paste",
      "editor-select-all",
      "editor-find",
      "editor-replace",
      "editor-goto",
      "editor-word-wrap",
      "editor-readonly",
      "editor-save",
      "editor-reload",
    ]) {
      const entry = items.find((i) => i.id === id);
      expect(entry && "disabled" in entry ? entry.disabled : undefined, id).toBe(true);
    }
  });
});
