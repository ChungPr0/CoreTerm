import { useEffect, useRef } from "react";

interface UseGlobalShortcutsOpts {
  hasBlockingModal: boolean;
  hasAnyModal: boolean;
  isSidebarOpen: boolean;
  hasContextMenu: boolean;
  onTogglePalette: () => void;
  onNewLocalTab: () => void;
  onFindInTerminal: () => void;
  onOpenSettings: () => void;
  onCloseContextMenu: () => void;
  onDismissSidebar: () => void;
}

/** Registers capture-phase app hotkeys so xterm/WebView2 cannot swallow them. */
export function useGlobalShortcuts(opts: UseGlobalShortcutsOpts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const cur = optsRef.current;
      const key = e.key.toLowerCase();

      if (!e.shiftKey) {
        if (e.key === ",") {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat && !cur.hasAnyModal) {
            cur.onCloseContextMenu();
            cur.onOpenSettings();
          }
          return;
        }
        // Always suppress WebView2's built-in Ctrl+F Find bar and route to Terminal Find.
        if (key === "f") {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat && !cur.hasAnyModal) {
            cur.onCloseContextMenu();
            cur.onFindInTerminal();
          }
        }
        return;
      }

      if (key !== "k" && key !== "t" && key !== "f") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;

      if (key === "k" && !cur.hasBlockingModal) {
        cur.onCloseContextMenu();
        cur.onTogglePalette();
      } else if (key === "t" && !cur.hasAnyModal) {
        cur.onCloseContextMenu();
        cur.onNewLocalTab();
      } else if (key === "f" && !cur.hasAnyModal) {
        cur.onCloseContextMenu();
        cur.onFindInTerminal();
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
