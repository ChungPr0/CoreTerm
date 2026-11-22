import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { buildEditorContextItems } from "../../menus/editorMenus";

describe("Editor Right-Click Selection Preservation (TC-ED-066)", () => {
  function handleRightClickMousedown(
    event: { button: number; preventDefault: () => void },
    state: EditorState
  ): boolean {
    if (event.button === 2) {
      const sel = state.selection.main;
      if (!sel.empty) {
        event.preventDefault();
        return true;
      }
    }
    return false;
  }

  it("prevents default and returns true on right-click when text is selected", () => {
    let prevented = false;
    const mockEvent = {
      button: 2,
      preventDefault: () => {
        prevented = true;
      },
    };

    const stateWithSelection = EditorState.create({
      doc: "Hello World CoreTerm",
      selection: EditorSelection.single(0, 5), // Selected "Hello"
    });

    const sel = stateWithSelection.selection.main;
    expect(sel.empty).toBe(false);

    const handled = handleRightClickMousedown(mockEvent, stateWithSelection);

    expect(prevented).toBe(true);
    expect(handled).toBe(true);
  });

  it("does not prevent default on right-click when there is no text selected", () => {
    let prevented = false;
    const mockEvent = {
      button: 2,
      preventDefault: () => {
        prevented = true;
      },
    };

    const stateNoSelection = EditorState.create({
      doc: "Hello World CoreTerm",
      selection: EditorSelection.cursor(3),
    });

    expect(stateNoSelection.selection.main.empty).toBe(true);

    const handled = handleRightClickMousedown(mockEvent, stateNoSelection);

    expect(prevented).toBe(false);
    expect(handled).toBe(false);
  });

  it("does not prevent default on left-click even if text is selected", () => {
    let prevented = false;
    const mockEvent = {
      button: 0,
      preventDefault: () => {
        prevented = true;
      },
    };

    const stateWithSelection = EditorState.create({
      doc: "Hello World CoreTerm",
      selection: EditorSelection.single(0, 5),
    });

    const handled = handleRightClickMousedown(mockEvent, stateWithSelection);

    expect(prevented).toBe(false);
    expect(handled).toBe(false);
  });

  it("buildEditorContextItems correctly enables/disables Cut and Copy based on selection", () => {
    const t = (key: string) => key;
    const dummy = vi.fn();

    // 1. With selection
    const itemsWithSel = buildEditorContextItems({
      t,
      hasSelection: true,
      readonly: false,
      isDirty: false,
      isRemote: false,
      isDisconnected: false,
      onCut: dummy,
      onCopy: dummy,
      onPaste: dummy,
      onSelectAll: dummy,
      onFind: dummy,
      onGotoLine: dummy,
      onSave: dummy,
      onReload: dummy,
      onCopyPath: dummy,
    });

    const cutWithSel = itemsWithSel.find((i) => i.id === "editor-cut");
    const copyWithSel = itemsWithSel.find((i) => i.id === "editor-copy");
    expect(cutWithSel && "disabled" in cutWithSel ? cutWithSel.disabled : undefined).toBe(false);
    expect(copyWithSel && "disabled" in copyWithSel ? copyWithSel.disabled : undefined).toBe(false);

    // 2. Without selection
    const itemsNoSel = buildEditorContextItems({
      t,
      hasSelection: false,
      readonly: false,
      isDirty: false,
      isRemote: false,
      isDisconnected: false,
      onCut: dummy,
      onCopy: dummy,
      onPaste: dummy,
      onSelectAll: dummy,
      onFind: dummy,
      onGotoLine: dummy,
      onSave: dummy,
      onReload: dummy,
      onCopyPath: dummy,
    });

    const cutNoSel = itemsNoSel.find((i) => i.id === "editor-cut");
    const copyNoSel = itemsNoSel.find((i) => i.id === "editor-copy");
    expect(cutNoSel && "disabled" in cutNoSel ? cutNoSel.disabled : undefined).toBe(true);
    expect(copyNoSel && "disabled" in copyNoSel ? copyNoSel.disabled : undefined).toBe(true);

    // 3. In readonly mode
    const itemsReadonly = buildEditorContextItems({
      t,
      hasSelection: true,
      readonly: true,
      isDirty: false,
      isRemote: false,
      isDisconnected: false,
      onCut: dummy,
      onCopy: dummy,
      onPaste: dummy,
      onSelectAll: dummy,
      onFind: dummy,
      onGotoLine: dummy,
      onSave: dummy,
      onReload: dummy,
      onCopyPath: dummy,
    });

    const cutReadonly = itemsReadonly.find((i) => i.id === "editor-cut");
    const copyReadonly = itemsReadonly.find((i) => i.id === "editor-copy");
    const pasteReadonly = itemsReadonly.find((i) => i.id === "editor-paste");
    expect(cutReadonly && "disabled" in cutReadonly ? cutReadonly.disabled : undefined).toBe(true);
    expect(copyReadonly && "disabled" in copyReadonly ? copyReadonly.disabled : undefined).toBe(false);
    expect(pasteReadonly && "disabled" in pasteReadonly ? pasteReadonly.disabled : undefined).toBe(true);
  });
});
