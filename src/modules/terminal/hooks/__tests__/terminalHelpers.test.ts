import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import {
  bindScrollbackSync,
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
});
