import { describe, expect, it, vi } from "vitest";
import {
  handleGlobalKeyDown,
  type UseGlobalShortcutsOpts,
} from "../useGlobalShortcuts";

function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    preventDefault,
    stopPropagation,
    ...overrides,
  } as unknown as KeyboardEvent;
  return { event, preventDefault, stopPropagation };
}

function makeOpts(overrides: Partial<UseGlobalShortcutsOpts> = {}) {
  const opts: UseGlobalShortcutsOpts = {
    hasBlockingModal: false,
    hasAnyModal: false,
    isSidebarOpen: false,
    hasContextMenu: false,
    onTogglePalette: vi.fn(),
    onNewLocalTab: vi.fn(),
    onCloseActiveTab: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleSftpSplit: vi.fn(),
    onFindInTerminal: vi.fn(),
    onOpenSettings: vi.fn(),
    onToggleFullscreen: vi.fn(),
    onCloseContextMenu: vi.fn(),
    onDismissSidebar: vi.fn(),
    ...overrides,
  };
  return opts;
}

describe("handleGlobalKeyDown", () => {
  it("handles Ctrl+Shift+W/B/E/T/F/K and closes context menu", () => {
    const cases: Array<[string, keyof UseGlobalShortcutsOpts]> = [
      ["W", "onCloseActiveTab"],
      ["w", "onCloseActiveTab"],
      ["B", "onToggleSidebar"],
      ["E", "onToggleSftpSplit"],
      ["T", "onNewLocalTab"],
      ["F", "onFindInTerminal"],
      ["K", "onTogglePalette"],
    ];

    for (const [key, handlerName] of cases) {
      const opts = makeOpts();
      const { event, preventDefault, stopPropagation } = makeKeyEvent({
        key,
        ctrlKey: true,
        shiftKey: true,
      });
      handleGlobalKeyDown(event, opts);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(opts.onCloseContextMenu).toHaveBeenCalledTimes(1);
      expect(opts[handlerName]).toHaveBeenCalledTimes(1);
    }
  });

  it("still prevents WebView2 default on Ctrl+Shift+W/B/E when a modal is open, without firing handlers", () => {
    for (const key of ["W", "B", "E", "T", "F"]) {
      const opts = makeOpts({ hasBlockingModal: true, hasAnyModal: true });
      const { event, preventDefault, stopPropagation } = makeKeyEvent({
        key,
        ctrlKey: true,
        shiftKey: true,
      });
      handleGlobalKeyDown(event, opts);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(opts.onCloseActiveTab).not.toHaveBeenCalled();
      expect(opts.onToggleSidebar).not.toHaveBeenCalled();
      expect(opts.onToggleSftpSplit).not.toHaveBeenCalled();
      expect(opts.onNewLocalTab).not.toHaveBeenCalled();
      expect(opts.onFindInTerminal).not.toHaveBeenCalled();
      expect(opts.onCloseContextMenu).not.toHaveBeenCalled();
    }
  });

  it("suppresses repeat events without invoking handlers", () => {
    const opts = makeOpts();
    const { event, preventDefault, stopPropagation } = makeKeyEvent({
      key: "W",
      ctrlKey: true,
      shiftKey: true,
      repeat: true,
    });
    handleGlobalKeyDown(event, opts);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(opts.onCloseActiveTab).not.toHaveBeenCalled();
  });

  it("handles plain Ctrl+F for Terminal Find and suppresses WebView2 Find even with a modal open", () => {
    const opts = makeOpts();
    const { event, preventDefault, stopPropagation } = makeKeyEvent({
      key: "f",
      ctrlKey: true,
      shiftKey: false,
    });
    handleGlobalKeyDown(event, opts);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(opts.onCloseContextMenu).toHaveBeenCalledTimes(1);
    expect(opts.onFindInTerminal).toHaveBeenCalledTimes(1);

    const modalOpts = makeOpts({ hasAnyModal: true });
    const modalEv = makeKeyEvent({ key: "f", ctrlKey: true, shiftKey: false });
    handleGlobalKeyDown(modalEv.event, modalOpts);
    expect(modalEv.preventDefault).toHaveBeenCalledTimes(1);
    expect(modalEv.stopPropagation).toHaveBeenCalledTimes(1);
    expect(modalOpts.onFindInTerminal).not.toHaveBeenCalled();
  });

  it("leaves all plain Ctrl+A..Z (except Ctrl+F) and Ctrl+Shift+L/A/C/V untouched", () => {
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      if (letter === "f") continue;
      for (const key of [letter, letter.toUpperCase()]) {
        const opts = makeOpts();
        const { event, preventDefault, stopPropagation } = makeKeyEvent({
          key,
          ctrlKey: true,
          shiftKey: false,
        });
        handleGlobalKeyDown(event, opts);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();
        expect(opts.onTogglePalette).not.toHaveBeenCalled();
        expect(opts.onNewLocalTab).not.toHaveBeenCalled();
        expect(opts.onCloseActiveTab).not.toHaveBeenCalled();
        expect(opts.onToggleSidebar).not.toHaveBeenCalled();
        expect(opts.onToggleSftpSplit).not.toHaveBeenCalled();
        expect(opts.onFindInTerminal).not.toHaveBeenCalled();
        expect(opts.onOpenSettings).not.toHaveBeenCalled();
        expect(opts.onCloseContextMenu).not.toHaveBeenCalled();
      }
    }

    for (const key of ["L", "A", "C", "V"]) {
      const opts = makeOpts();
      const { event, preventDefault, stopPropagation } = makeKeyEvent({
        key,
        ctrlKey: true,
        shiftKey: true,
      });
      handleGlobalKeyDown(event, opts);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(stopPropagation).not.toHaveBeenCalled();
    }
  });

  it("handles F11 fullscreen toggle unless a modal is open", () => {
    const opts = makeOpts();
    const { event, preventDefault, stopPropagation } = makeKeyEvent({ key: "F11" });
    handleGlobalKeyDown(event, opts);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(opts.onCloseContextMenu).toHaveBeenCalledTimes(1);
    expect(opts.onToggleFullscreen).toHaveBeenCalledTimes(1);

    const modalOpts = makeOpts({ hasAnyModal: true });
    const modalEv = makeKeyEvent({ key: "F11" });
    handleGlobalKeyDown(modalEv.event, modalOpts);
    expect(modalEv.preventDefault).toHaveBeenCalledTimes(1);
    expect(modalEv.stopPropagation).toHaveBeenCalledTimes(1);
    expect(modalOpts.onToggleFullscreen).not.toHaveBeenCalled();
  });

  it("ignores Alt-modified or Ctrl+Meta chorded events", () => {
    const opts = makeOpts();
    for (const overrides of [
      { key: "W", ctrlKey: true, shiftKey: true, altKey: true },
      { key: "W", ctrlKey: true, metaKey: true, shiftKey: true },
    ]) {
      const { event, preventDefault, stopPropagation } = makeKeyEvent(overrides);
      handleGlobalKeyDown(event, opts);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(stopPropagation).not.toHaveBeenCalled();
    }
    expect(opts.onCloseActiveTab).not.toHaveBeenCalled();
  });
});
