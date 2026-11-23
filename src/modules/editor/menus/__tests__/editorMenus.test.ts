import { describe, expect, it, vi } from "vitest";
import { buildEditorContextItems, buildEditorToolbarMenu } from "../editorMenus";

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

describe("Editor Menus (Unified Context Menu)", () => {
  it("builds unified context menu with Ctrl+H Replace and proper disabled states", () => {
    const onCut = vi.fn();
    const onCopy = vi.fn();
    const onPaste = vi.fn();
    const onSelectAll = vi.fn();
    const onFind = vi.fn();
    const onReplace = vi.fn();
    const onGotoLine = vi.fn();
    const onToggleWordWrap = vi.fn();
    const onToggleReadonly = vi.fn();
    const onSave = vi.fn();
    const onReload = vi.fn();
    const onReconnect = vi.fn();
    const onCopyPath = vi.fn();
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
      wordWrap: true,
      isRemote: true,
      isDisconnected: false,
      onCut,
      onCopy,
      onPaste,
      onSelectAll,
      onFind,
      onReplace,
      onGotoLine,
      onToggleWordWrap,
      onToggleReadonly,
      onSave,
      onReload,
      onReconnect,
      onCopyPath,
      onClose,
    });

    // 1. Cut, Copy, Paste, Select All
    const cutItem = items.find((i) => i.id === "editor-cut");
    const copyItem = items.find((i) => i.id === "editor-copy");
    const pasteItem = items.find((i) => i.id === "editor-paste");
    const selectAllItem = items.find((i) => i.id === "editor-select-all");
    expect(cutItem && "disabled" in cutItem ? cutItem.disabled : undefined).toBe(false);
    expect(copyItem && "disabled" in copyItem ? copyItem.disabled : undefined).toBe(false);
    expect(pasteItem && "disabled" in pasteItem ? pasteItem.disabled : undefined).toBe(false);
    expect(selectAllItem).toBeDefined();

    // 2. Find (Ctrl+F), Replace (Ctrl+H), Goto Line (Ctrl+G)
    const findItem = items.find((i) => i.id === "editor-find");
    const replaceItem = items.find((i) => i.id === "editor-replace");
    const gotoItem = items.find((i) => i.id === "editor-goto");
    expect(findItem && "shortcut" in findItem ? findItem.shortcut : undefined).toBe("Ctrl+F");
    expect(replaceItem && "shortcut" in replaceItem ? replaceItem.shortcut : undefined).toBe("Ctrl+H");
    expect(replaceItem && "disabled" in replaceItem ? replaceItem.disabled : undefined).toBe(false);
    expect(gotoItem && "shortcut" in gotoItem ? gotoItem.shortcut : undefined).toBe("Ctrl+G");

    // 3. View mode (Word Wrap with badge, Readonly)
    const wordWrapItem = items.find((i) => i.id === "editor-word-wrap");
    const readonlyItem = items.find((i) => i.id === "editor-readonly");
    expect(wordWrapItem && "badge" in wordWrapItem ? wordWrapItem.badge?.text : undefined).toBe("ctx.state_on");
    expect(readonlyItem).toBeDefined();

    // 4. File operations (Save, Reload, Reconnect, Copy Path, Close)
    const saveItem = items.find((i) => i.id === "editor-save");
    const reloadItem = items.find((i) => i.id === "editor-reload");
    const reconnectItem = items.find((i) => i.id === "editor-reconnect");
    const copyPathItem = items.find((i) => i.id === "editor-copy-path");
    const closeItem = items.find((i) => i.id === "editor-close");
    expect(saveItem && "disabled" in saveItem ? saveItem.disabled : undefined).toBe(false);
    expect(reloadItem && "disabled" in reloadItem ? reloadItem.disabled : undefined).toBe(false);
    expect(reconnectItem).toBeDefined();
    expect(copyPathItem).toBeDefined();
    expect(closeItem).toBeDefined();

    // Trigger Replace
    if (replaceItem && "onSelect" in replaceItem) replaceItem.onSelect?.();
    expect(onReplace).toHaveBeenCalledTimes(1);

    // Trigger Save
    if (saveItem && "onSelect" in saveItem) saveItem.onSelect?.();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("disables replace and paste when editor is readonly", () => {
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

    const cutItem = items.find((i) => i.id === "editor-cut");
    const copyItem = items.find((i) => i.id === "editor-copy");
    const pasteItem = items.find((i) => i.id === "editor-paste");
    const replaceItem = items.find((i) => i.id === "editor-replace");
    const readonlyItem = items.find((i) => i.id === "editor-readonly");

    expect(cutItem && "disabled" in cutItem ? cutItem.disabled : undefined).toBe(true);
    expect(copyItem && "disabled" in copyItem ? copyItem.disabled : undefined).toBe(false);
    expect(pasteItem && "disabled" in pasteItem ? pasteItem.disabled : undefined).toBe(true);
    expect(replaceItem && "disabled" in replaceItem ? replaceItem.disabled : undefined).toBe(true);
    expect(readonlyItem && "disabled" in readonlyItem ? readonlyItem.disabled : undefined).toBe(true);
  });

  it("buildEditorToolbarMenu produces identical menu structure to buildEditorContextItems", () => {
    const dummy = vi.fn();
    const opts = {
      t,
      hasSelection: false,
      readonly: false,
      fileReadonly: false,
      isDirty: false,
      saving: false,
      loading: false,
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
    };

    const contextItems = buildEditorContextItems(opts);
    const toolbarItems = buildEditorToolbarMenu(opts);

    expect(toolbarItems.map((i) => i.id)).toEqual(contextItems.map((i) => i.id));
  });
});
