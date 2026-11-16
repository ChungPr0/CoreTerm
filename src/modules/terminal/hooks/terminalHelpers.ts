import type React from "react";
import { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { Channel } from "@/shared/api/tauriClient";
import { copyText, readText } from "@/shared/utils/clipboard";

export const XTERM_THEME = {
  background: "#090d16",
  foreground: "#e2e8f0",
  cursor: "#38bdf8",
  cursorAccent: "#090d16",
  selectionBackground: "rgba(56, 189, 248, 0.28)",
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

export function createTerminalInstance(cols: number, rows: number): Terminal {
  return new Terminal({
    cols,
    rows,
    cursorBlink: true,
    cursorStyle: "block",
    fontFamily: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    scrollback: 10000,
    allowProposedApi: true,
    convertEol: false,
    theme: XTERM_THEME,
  });
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

/** Loads WebGL renderer on the next animation frame when mounted cleanly. */
export function attachWebglRenderer(
  term: Terminal,
  isCancelled: () => boolean
): () => void {
  const rafId = window.requestAnimationFrame(() => {
    if (isCancelled()) return;
    import("@xterm/addon-webgl")
      .then(({ WebglAddon }) => {
        if (isCancelled()) return;
        try {
          const addon = new WebglAddon();
          addon.onContextLoss(() => addon.dispose());
          term.loadAddon(addon);
        } catch {
          // Fallback to default canvas renderer
        }
      })
      .catch(() => {});
  });
  return () => window.cancelAnimationFrame(rafId);
}

/** Prevents WebView2 default accelerators on Ctrl+Shift+C/V so clipboard fires once. */
export function bindTerminalShortcuts(
  term: Terminal,
  isCancelled: () => boolean
): void {
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && key === "f") {
      return false;
    }
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
      if (key === "c" || key === "v") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          if (key === "c") {
            const selected = term.getSelection();
            if (selected) void copyText(selected);
          } else {
            void readText().then((txt) => {
              if (!isCancelled() && txt) term.paste(txt);
            });
          }
        }
        return false;
      }
    }
    return true;
  });
}

/** Toggles container scrollback class and fits PTY when scrollbar appears/disappears. */
export function bindScrollbackSync(
  term: Terminal,
  container: HTMLDivElement,
  fitAddon: FitAddon,
  isActiveRef: React.MutableRefObject<boolean>,
  syncPtySize: (term: Terminal) => void
): () => void {
  let lastHasScrollback = false;
  const syncScrollbackClass = () => {
    const hasScrollback = term.buffer.active.baseY > 0;
    container.classList.toggle("xterm-has-scrollback", hasScrollback);
    container.classList.toggle("xterm-no-scrollback", !hasScrollback);
    if (hasScrollback !== lastHasScrollback) {
      lastHasScrollback = hasScrollback;
      if (isActiveRef.current) {
        try {
          fitAddon.fit();
          syncPtySize(term);
        } catch {
          // Ignore resize during write
        }
      }
    }
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
