import { useEffect, useRef } from "react";
import {
  eventToShortcutChord,
  getShortcutChord,
  type KeybindingOverrides,
} from "@/shared/utils/shortcuts";

export interface UseGlobalShortcutsOpts {
  hasBlockingModal: boolean;
  hasAnyModal: boolean;
  isSidebarOpen: boolean;
  hasContextMenu: boolean;
  keybindings?: KeybindingOverrides;
  onTogglePalette: () => void;
  onNewLocalTab: () => void;
  onDuplicateActiveTab?: () => void;
  onCloseActiveTab: () => void;
  onNextTab?: () => void;
  onPrevTab?: () => void;
  onToggleSidebar: () => void;
  onToggleSftpSplit: () => void;
  onFindInTerminal: () => void;
  onOpenSettings: () => void;
  onToggleFullscreen?: () => void;
  onCloseContextMenu: () => void;
  onDismissSidebar: () => void;
}

export function handleGlobalKeyDown(
  e: KeyboardEvent,
  cur: UseGlobalShortcutsOpts
): void {
  const targetEl = e.target as HTMLElement | null;
  if (targetEl?.closest?.("[data-shortcut-recorder='true']")) {
    return;
  }

  const chord = eventToShortcutChord(e);
  if (!chord) return;

  const kb = cur.keybindings;
  const fullscreenChord = getShortcutChord("toggleFullscreen", kb);
  const paletteChord = getShortcutChord("commandPalette", kb);
  const newTabChord = getShortcutChord("newTab", kb);
  const duplicateTabChord = getShortcutChord("duplicateTab", kb);
  const closeTabChord = getShortcutChord("closeTab", kb);
  const nextTabChord = getShortcutChord("nextTab", kb);
  const prevTabChord = getShortcutChord("prevTab", kb);
  const sidebarChord = getShortcutChord("toggleSidebar", kb);
  const sftpChord = getShortcutChord("toggleSftpPanel", kb);
  const settingsChord = getShortcutChord("openSettings", kb);
  const findChord = getShortcutChord("termFind", kb);

  const runModalGuarded = (allowWhenPaletteOpen: boolean, action?: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (allowWhenPaletteOpen ? cur.hasBlockingModal : cur.hasAnyModal) return;
    cur.onCloseContextMenu();
    action?.();
  };

  if (chord === fullscreenChord) {
    runModalGuarded(false, cur.onToggleFullscreen);
    return;
  }
  if (chord === paletteChord) {
    runModalGuarded(true, cur.onTogglePalette);
    return;
  }
  if (chord === newTabChord) {
    runModalGuarded(false, cur.onNewLocalTab);
    return;
  }
  if (chord === duplicateTabChord) {
    runModalGuarded(false, cur.onDuplicateActiveTab);
    return;
  }
  if (chord === closeTabChord) {
    runModalGuarded(false, cur.onCloseActiveTab);
    return;
  }
  if (chord === nextTabChord) {
    runModalGuarded(false, cur.onNextTab);
    return;
  }
  if (chord === prevTabChord) {
    runModalGuarded(false, cur.onPrevTab);
    return;
  }
  if (chord === sidebarChord) {
    runModalGuarded(false, cur.onToggleSidebar);
    return;
  }
  if (chord === sftpChord) {
    runModalGuarded(false, cur.onToggleSftpSplit);
    return;
  }
  if (chord === settingsChord) {
    runModalGuarded(false, cur.onOpenSettings);
    return;
  }
  // Always suppress WebView2's built-in Ctrl+F Find bar and route to Find alongside configured termFind.
  if (chord === findChord || chord === "Ctrl+F") {
    runModalGuarded(false, cur.onFindInTerminal);
  }
}

/** Registers capture-phase app hotkeys so xterm/WebView2 cannot swallow them. */
export function useGlobalShortcuts(opts: UseGlobalShortcutsOpts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleGlobalKeyDown(e, optsRef.current);
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
