import { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { Channel } from "@/shared/api/tauriClient";
import {
  clampLaunchCols,
  clampLaunchRows,
  TERM_DEFAULT_CELL_H,
  TERM_DEFAULT_CELL_W,
  TERM_DEFAULT_CHROME_H,
  TERM_DEFAULT_CHROME_W,
  TERM_FONT_FAMILY_DEFAULT,
  TERM_FONT_SIZE_DEFAULT,
  TERM_LAUNCH_PAD_PX,
  TERM_LINE_HEIGHT_DEFAULT,
  TERM_MIN_COLS,
  TERM_MIN_ROWS,
  TERM_SCROLLBACK_DEFAULT,
  TERM_SCROLLBAR_PX,
  THEME_SELECTION_BG,
} from "@/shared/defaults";
import { copyText, readText } from "@/shared/utils/clipboard";
import {
  eventToShortcutChord,
  getShortcutChord,
  SHORTCUT_DEFINITIONS,
  type KeybindingOverrides,
} from "@/shared/utils/shortcuts";

export const XTERM_THEME = {
  background: "#090d16",
  foreground: "#e2e8f0",
  cursor: "#38bdf8",
  cursorAccent: "#090d16",
  selectionBackground: THEME_SELECTION_BG,
  black: "#1e293b",
  red: "#f43f5e",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#f1f5f9",
  brightBlack: "#475569",
  brightRed: "#fb7185",
  brightGreen: "#34d399",
  brightYellow: "#fbbf24",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};

export { TERM_MIN_COLS, TERM_MIN_ROWS, TERM_SCROLLBAR_PX };
const LAUNCH_PAD_PX = TERM_LAUNCH_PAD_PX;
const DEFAULT_CELL_W = TERM_DEFAULT_CELL_W;
const DEFAULT_CELL_H = TERM_DEFAULT_CELL_H;
const DEFAULT_CHROME_W = TERM_DEFAULT_CHROME_W;
const DEFAULT_CHROME_H = TERM_DEFAULT_CHROME_H;

export interface TermMetrics {
  cellW: number;
  cellH: number;
  chromeW: number;
  chromeH: number;
}

interface XtermCellDims {
  width?: number;
  height?: number;
}

interface XtermCoreLike {
  _renderService?: {
    dimensions?: { css?: { cell?: XtermCellDims } };
    clear?: () => void;
  };
}

let lastMetrics: TermMetrics = {
  cellW: DEFAULT_CELL_W,
  cellH: DEFAULT_CELL_H,
  chromeW: DEFAULT_CHROME_W,
  chromeH: DEFAULT_CHROME_H,
};

export interface TerminalAppearanceOpts {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
}

export function createTerminalInstance(
  cols: number,
  rows: number,
  appearance?: Partial<TerminalAppearanceOpts>
): Terminal {
  return new Terminal({
    cols,
    rows,
    cursorBlink: appearance?.cursorBlink ?? true,
    cursorStyle: appearance?.cursorStyle ?? "block",
    fontFamily: appearance?.fontFamily ?? TERM_FONT_FAMILY_DEFAULT,
    fontSize: appearance?.fontSize ?? TERM_FONT_SIZE_DEFAULT,
    lineHeight: appearance?.lineHeight ?? TERM_LINE_HEIGHT_DEFAULT,
    scrollback: appearance?.scrollback ?? TERM_SCROLLBACK_DEFAULT,
    allowProposedApi: true,
    convertEol: false,
    theme: XTERM_THEME,
  });
}

export function getCellSize(term: Terminal): { w: number; h: number } | null {
  const cell = (term as unknown as { _core?: XtermCoreLike })._core?._renderService
    ?.dimensions?.css?.cell;
  const w = cell?.width ?? 0;
  const h = cell?.height ?? 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

export function measureTermMetrics(
  term: Terminal,
  container: HTMLElement
): TermMetrics {
  const cell = getCellSize(term);
  const hasBox = container.clientWidth > 0 && container.clientHeight > 0;
  const next: TermMetrics = {
    cellW: cell?.w ?? lastMetrics.cellW,
    cellH: cell?.h ?? lastMetrics.cellH,
    chromeW: hasBox
      ? Math.max(0, window.innerWidth - container.clientWidth)
      : lastMetrics.chromeW,
    chromeH: hasBox
      ? Math.max(0, window.innerHeight - container.clientHeight)
      : lastMetrics.chromeH,
  };
  lastMetrics = next;
  return next;
}

export function calcWinSize(
  cols: number,
  rows: number,
  metrics: TermMetrics = lastMetrics
): { width: number; height: number } {
  const c = clampLaunchCols(cols);
  const r = clampLaunchRows(rows);
  return {
    width: Math.ceil(c * metrics.cellW) + TERM_SCROLLBAR_PX + LAUNCH_PAD_PX + metrics.chromeW,
    height: Math.ceil(r * metrics.cellH) + LAUNCH_PAD_PX + metrics.chromeH,
  };
}

export function calcFitDims(
  term: Terminal,
  container: HTMLElement,
  fitAddon: FitAddon
): { cols: number; rows: number } | null {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width <= 0 || height <= 0) return null;
  const cell = getCellSize(term);
  if (cell) {
    const availW = Math.max(0, width - TERM_SCROLLBAR_PX);
    return {
      cols: Math.max(2, Math.floor(availW / cell.w)),
      rows: Math.max(1, Math.floor(height / cell.h)),
    };
  }
  return fitAddon.proposeDimensions() ?? null;
}

/** Resizes xterm to container while keeping consistent scrollbar reservation. */
export function fitTerm(
  term: Terminal,
  container: HTMLElement,
  fitAddon: FitAddon
): boolean {
  const dims = calcFitDims(term, container, fitAddon);
  if (!dims || Number.isNaN(dims.cols) || Number.isNaN(dims.rows)) return false;
  if (term.cols === dims.cols && term.rows === dims.rows) return false;
  const core = (term as unknown as { _core?: XtermCoreLike })._core;
  core?._renderService?.clear?.();
  term.resize(dims.cols, dims.rows);
  return true;
}

export function createOutputChannel(
  term: Terminal,
  isCancelled: () => boolean
): Channel<number[] | Uint8Array> {
  const channel = new Channel<number[] | Uint8Array>();
  channel.onmessage = (chunk) => {
    if (isCancelled()) return;
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    term.write(bytes);
  };
  return channel;
}

/** Waits for document fonts and attaches WebGL renderer, falling back to DOM on error. */
export async function loadWebgl(
  term: Terminal,
  isCancelled: () => boolean,
  onContextLost?: () => void
): Promise<{ dispose: () => void } | null> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready.catch(() => undefined),
      new Promise<void>((r) => setTimeout(r, 100)),
    ]);
  }
  if (isCancelled()) return null;
  try {
    const { WebglAddon } = await import("@xterm/addon-webgl");
    if (isCancelled()) return null;
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      addon.dispose();
      onContextLost?.();
    });
    term.loadAddon(addon);
    return addon;
  } catch {
    return null;
  }
}

export interface TerminalShortcutCallbacks {
  getKeybindings?: () => KeybindingOverrides | undefined;
  onPasteShortcut?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

/** Handles terminal-scoped shortcuts and zoom controls without leaking to PTY or WebView2. */
export function bindTerminalShortcuts(
  term: Terminal,
  isCancelled: () => boolean,
  isBlocked?: () => boolean,
  callbacks?: TerminalShortcutCallbacks
): void {
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest?.("[data-shortcut-recorder='true']")) {
      return true;
    }

    const chord = eventToShortcutChord(e);
    if (!chord) return true;

    const kb = callbacks?.getKeybindings?.();
    if (
      chord === "Ctrl+F" ||
      SHORTCUT_DEFINITIONS.some(
        (def) => def.scope === "global" && getShortcutChord(def.id, kb) === chord
      )
    ) {
      return false;
    }

    const copyChord = getShortcutChord("termCopy", kb);
    const pasteChord = getShortcutChord("termPaste", kb);
    const selectAllChord = getShortcutChord("termSelectAll", kb);
    const clearChord = getShortcutChord("termClear", kb);

    if (
      chord === copyChord ||
      chord === pasteChord ||
      chord === selectAllChord ||
      chord === clearChord
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !isBlocked?.()) {
        if (chord === copyChord) {
          const selected = term.getSelection();
          if (selected) void copyText(selected);
        } else if (chord === pasteChord) {
          if (callbacks?.onPasteShortcut) {
            callbacks.onPasteShortcut();
          } else {
            void readText().then((txt) => {
              if (!isCancelled() && txt) term.paste(txt);
            });
          }
        } else if (chord === selectAllChord) {
          term.selectAll();
        } else {
          term.clear();
        }
      }
      return false;
    }

    const zoomInChord = getShortcutChord("termZoomIn", kb);
    const zoomOutChord = getShortcutChord("termZoomOut", kb);
    const zoomResetChord = getShortcutChord("termZoomReset", kb);

    if (
      callbacks?.onZoomIn &&
      (chord === zoomInChord || (zoomInChord === "Ctrl+=" && chord === "Ctrl+Shift+="))
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !isBlocked?.()) {
        callbacks.onZoomIn();
      }
      return false;
    }

    if (callbacks?.onZoomOut && chord === zoomOutChord) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !isBlocked?.()) {
        callbacks.onZoomOut();
      }
      return false;
    }

    if (callbacks?.onResetZoom && chord === zoomResetChord) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !isBlocked?.()) {
        callbacks.onResetZoom();
      }
      return false;
    }

    return true;
  });
}

/** Waits up to 50ms for next animation frame so window resize layout settles. */
export function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = window.setTimeout(finish, 50);
    window.requestAnimationFrame(() => {
      window.clearTimeout(timer);
      finish();
    });
  });
}

/** Toggles container scrollback class without changing reserved column width. */
export function bindScrollbackSync(
  term: Terminal,
  container: HTMLDivElement
): () => void {
  const syncScrollbackClass = () => {
    const hasScrollback = term.buffer.active.baseY > 0;
    container.classList.toggle("xterm-has-scrollback", hasScrollback);
    container.classList.toggle("xterm-no-scrollback", !hasScrollback);
  };

  syncScrollbackClass();
  const d1 = term.onWriteParsed(syncScrollbackClass);
  const d2 = term.onScroll(syncScrollbackClass);
  const d3 = term.onResize(syncScrollbackClass);
  return () => {
    d1.dispose();
    d2.dispose();
    d3.dispose();
  };
}
