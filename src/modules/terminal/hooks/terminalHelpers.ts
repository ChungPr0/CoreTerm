import type React from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { copyText, readText } from "@/shared/utils/clipboard";

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
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
      const key = e.key.toLowerCase();
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
