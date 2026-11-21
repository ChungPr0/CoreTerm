import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import {
  bindScrollbackSync,
  bindTerminalShortcuts,
  calcFitDims,
  calcWinSize,
  createTerminalInstance,
  fitTerm,
  TERM_SCROLLBAR_PX,
  type TermMetrics,
} from "../terminalHelpers";

function mockTerm(opts: {
  cols: number;
  rows: number;
  cellW?: number;
  cellH?: number;
  baseY?: number;
}) {
  const clear = vi.fn();
  const resize = vi.fn();
  const listeners: Array<() => void> = [];
  const sub = () => ({
    dispose: () => {},
  });
  const term = {
    cols: opts.cols,
    rows: opts.rows,
    buffer: { active: { baseY: opts.baseY ?? 0 } },
    resize,
    onWriteParsed: (cb: () => void) => {
      listeners.push(cb);
      return sub();
    },
    onScroll: (cb: () => void) => {
      listeners.push(cb);
      return sub();
    },
    onResize: (cb: () => void) => {
      listeners.push(cb);
      return sub();
    },
    _core: {
      _renderService: {
        dimensions:
          opts.cellW && opts.cellH
            ? { css: { cell: { width: opts.cellW, height: opts.cellH } } }
            : undefined,
        clear,
      },
    },
  };
  return {
    term: term as unknown as Terminal,
    clear,
    resize,
    trigger: () => listeners.forEach((fn) => fn()),
  };
}

function mockFitAddon(proposed?: { cols: number; rows: number }) {
  return {
    proposeDimensions: vi.fn(() => proposed),
  } as unknown as FitAddon;
}

describe("terminalHelpers", () => {
  it("configures readable Windows Terminal-grade default font metrics", () => {
    const term = createTerminalInstance(120, 30);
    expect(term.options.fontSize).toBe(16);
    expect(term.options.lineHeight).toBe(1.0);
    expect(term.options.fontFamily).toContain("Cascadia Mono");
    expect(term.cols).toBe(120);
    expect(term.rows).toBe(30);
    term.dispose();
  });

  it("round-trips calcWinSize and calcFitDims to exact cols and rows across DPRs", () => {
    const cases: TermMetrics[] = [
      { cellW: 9, cellH: 19, chromeW: 12, chromeH: 48 }, // DPR 1.0 WebGL
      { cellW: 8.8, cellH: 19.2, chromeW: 12, chromeH: 48 }, // DPR 1.25 WebGL
      { cellW: 9.333333333333334, cellH: 19.333333333333332, chromeW: 12, chromeH: 48 }, // DPR 1.5 WebGL
      { cellW: 9.375, cellH: 19.2, chromeW: 14, chromeH: 50 }, // DOM fallback + non-native border
    ];

    for (const metrics of cases) {
      for (const [cols, rows] of [
        [120, 30],
        [140, 35],
        [80, 24],
      ]) {
        const win = calcWinSize(cols, rows, metrics);
        const container = {
          clientWidth: win.width - metrics.chromeW,
          clientHeight: win.height - metrics.chromeH,
        } as HTMLElement;
        const { term } = mockTerm({
          cols: 80,
          rows: 24,
          cellW: metrics.cellW,
          cellH: metrics.cellH,
        });
        const dims = calcFitDims(term, container, mockFitAddon());
        expect(dims).toEqual({ cols, rows });
      }
    }
  });

  it("reserves TERM_SCROLLBAR_PX consistently and avoids redundant resizes in fitTerm", () => {
    const { term, clear, resize } = mockTerm({
      cols: 120,
      rows: 30,
      cellW: 9,
      cellH: 19,
    });
    const container = {
      clientWidth: 120 * 9 + TERM_SCROLLBAR_PX,
      clientHeight: 30 * 19,
    } as HTMLElement;
    const fitAddon = mockFitAddon();

    expect(fitTerm(term, container, fitAddon)).toBe(false);
    expect(resize).not.toHaveBeenCalled();

    const narrower = {
      clientWidth: 119 * 9 + TERM_SCROLLBAR_PX + 8,
      clientHeight: 30 * 19,
    } as HTMLElement;
    expect(fitTerm(term, narrower, fitAddon)).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledWith(119, 30);
  });

  it("toggles scrollback classes without triggering mid-stream PTY resizes", () => {
    const classes = new Set<string>();
    const container = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
    } as unknown as HTMLDivElement;

    const { term, resize, trigger } = mockTerm({
      cols: 120,
      rows: 30,
      baseY: 0,
    });
    const dispose = bindScrollbackSync(term, container);
    expect(classes.has("xterm-no-scrollback")).toBe(true);
    expect(classes.has("xterm-has-scrollback")).toBe(false);

    (term.buffer.active as { baseY: number }).baseY = 5;
    trigger();
    expect(classes.has("xterm-has-scrollback")).toBe(true);
    expect(classes.has("xterm-no-scrollback")).toBe(false);
    expect(resize).not.toHaveBeenCalled();
    dispose();
  });

  it("handles Ctrl+Shift+C/V/L/A in terminal without leaking to PTY and passes plain Ctrl+A..Z (except F) through", () => {
    let keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
    const termClear = vi.fn();
    const termSelectAll = vi.fn();
    const termGetSelection = vi.fn(() => "");
    const term = {
      attachCustomKeyEventHandler: (fn: (e: KeyboardEvent) => boolean) => {
        keyHandler = fn;
      },
      clear: termClear,
      selectAll: termSelectAll,
      getSelection: termGetSelection,
      paste: vi.fn(),
    } as unknown as Terminal;

    let blocked = false;
    bindTerminalShortcuts(
      term,
      () => false,
      () => blocked
    );
    expect(keyHandler).not.toBeNull();

    const makeKey = (overrides: Partial<KeyboardEvent>) => {
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const event = {
        type: "keydown",
        key: "",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        repeat: false,
        preventDefault,
        stopPropagation,
        ...overrides,
      } as unknown as KeyboardEvent;
      return { event, preventDefault, stopPropagation };
    };

    const copyEv = makeKey({ key: "C", ctrlKey: true, shiftKey: true });
    expect(keyHandler!(copyEv.event)).toBe(false);
    expect(copyEv.preventDefault).toHaveBeenCalledTimes(1);
    expect(copyEv.stopPropagation).toHaveBeenCalledTimes(1);
    expect(termGetSelection).toHaveBeenCalledTimes(1);

    const pasteEv = makeKey({ key: "V", ctrlKey: true, shiftKey: true, repeat: true });
    expect(keyHandler!(pasteEv.event)).toBe(false);
    expect(pasteEv.preventDefault).toHaveBeenCalledTimes(1);
    expect(pasteEv.stopPropagation).toHaveBeenCalledTimes(1);

    const clearEv = makeKey({ key: "L", ctrlKey: true, shiftKey: true });
    expect(keyHandler!(clearEv.event)).toBe(false);
    expect(clearEv.preventDefault).toHaveBeenCalledTimes(1);
    expect(clearEv.stopPropagation).toHaveBeenCalledTimes(1);
    expect(termClear).toHaveBeenCalledTimes(1);

    // Ctrl+Shift+A selects all terminal buffer content without leaking to PTY.
    const selectAllEv = makeKey({ key: "A", ctrlKey: true, shiftKey: true });
    expect(keyHandler!(selectAllEv.event)).toBe(false);
    expect(selectAllEv.preventDefault).toHaveBeenCalledTimes(1);
    expect(selectAllEv.stopPropagation).toHaveBeenCalledTimes(1);
    expect(termSelectAll).toHaveBeenCalledTimes(1);

    // Repeat and blocked states still consume handled shortcuts without firing actions.
    const repeatClearEv = makeKey({ key: "L", ctrlKey: true, shiftKey: true, repeat: true });
    expect(keyHandler!(repeatClearEv.event)).toBe(false);
    expect(termClear).toHaveBeenCalledTimes(1);

    const repeatSelectAllEv = makeKey({ key: "a", ctrlKey: true, shiftKey: true, repeat: true });
    expect(keyHandler!(repeatSelectAllEv.event)).toBe(false);
    expect(termSelectAll).toHaveBeenCalledTimes(1);

    blocked = true;
    const blockedClearEv = makeKey({ key: "L", ctrlKey: true, shiftKey: true });
    expect(keyHandler!(blockedClearEv.event)).toBe(false);
    expect(termClear).toHaveBeenCalledTimes(1);

    const blockedSelectAllEv = makeKey({ key: "A", ctrlKey: true, shiftKey: true });
    expect(keyHandler!(blockedSelectAllEv.event)).toBe(false);
    expect(termSelectAll).toHaveBeenCalledTimes(1);
    blocked = false;

    // Ctrl+F and Ctrl+Shift+F are blocked from PTY so Terminal Find handles them.
    const plainFind = makeKey({ key: "f", ctrlKey: true, shiftKey: false });
    expect(keyHandler!(plainFind.event)).toBe(false);
    const shiftFind = makeKey({ key: "F", ctrlKey: true, shiftKey: true });
    expect(keyHandler!(shiftFind.event)).toBe(false);

    // All plain Ctrl+A..Z except Ctrl+F pass straight to PTY untouched.
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      if (letter === "f") continue;
      const plain = makeKey({ key: letter, ctrlKey: true, shiftKey: false });
      expect(keyHandler!(plain.event)).toBe(true);
      expect(plain.preventDefault).not.toHaveBeenCalled();
      expect(plain.stopPropagation).not.toHaveBeenCalled();
    }

    // Alt/Meta-modified events pass through untouched.
    const altEv = makeKey({ key: "A", ctrlKey: true, shiftKey: true, altKey: true });
    expect(keyHandler!(altEv.event)).toBe(true);
    const metaEv = makeKey({ key: "L", ctrlKey: true, shiftKey: true, metaKey: true });
    expect(keyHandler!(metaEv.event)).toBe(true);
    expect(termClear).toHaveBeenCalledTimes(1);
    expect(termSelectAll).toHaveBeenCalledTimes(1);
  });
});
