import { useEffect, useRef } from "react";

interface UseGlobalShortcutsOpts {
  hasBlockingModal: boolean;
  hasAnyModal: boolean;
  isSidebarOpen: boolean;
  hasContextMenu: boolean;
  onTogglePalette: () => void;
  onNewLocalTab: () => void;
  onCloseContextMenu: () => void;
  onDismissSidebar: () => void;
}

/** Registers capture-phase app hotkeys so xterm/WebView2 cannot swallow them. */
export function useGlobalShortcuts(opts: UseGlobalShortcutsOpts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "k" && key !== "t") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;

      const cur = optsRef.current;
      if (key === "k" && !cur.hasBlockingModal) {
        cur.onCloseContextMenu();
        cur.onTogglePalette();
      } else if (key === "t" && !cur.hasAnyModal) {
        cur.onCloseContextMenu();
        cur.onNewLocalTab();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!opts.isSidebarOpen || opts.hasAnyModal || opts.hasContextMenu) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        optsRef.current.onDismissSidebar();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [opts.isSidebarOpen, opts.hasAnyModal, opts.hasContextMenu]);
}
