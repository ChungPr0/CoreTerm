import { useCallback, useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import type { TerminalTabItem } from "@/shared/types/ipc";
import type { SessionConnectAckDto } from "../types";
import { sessionApi } from "../api/sessionApi";
import { useI18n } from "@/shared/i18n";
import { copyText, readText } from "@/shared/utils/clipboard";
import { extractRawErrorMessage, formatLocalizedError } from "@/shared/utils/formatError";
import {
  attachWebglRenderer,
  bindScrollbackSync,
  bindTerminalShortcuts,
  createOutputChannel,
  createTerminalInstance,
} from "./terminalHelpers";

export interface TerminalContextActions {
  hasSelection: boolean;
  copySelection: () => Promise<void>;
  pasteClipboard: () => Promise<void>;
  selectAll: () => void;
  clear: () => void;
  focus: () => void;
}

const RESIZE_DEBOUNCE_MS = 60;

interface UseTerminalSessionOpts {
  tab: TerminalTabItem;
  isActive: boolean;
  launchCols: number;
  launchRows: number;
  focusToken: number;
  suppressAutoFocus: boolean;
  onSessionAck?: (tabId: string, ack: SessionConnectAckDto) => void;
  onElevationCancelled?: (tabId: string) => void;
}

export function useTerminalSession({
  tab,
  isActive,
  launchCols,
  launchRows,
  focusToken,
  suppressAutoFocus,
  onSessionAck,
  onElevationCancelled,
}: UseTerminalSessionOpts) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const onSessionAckRef = useRef(onSessionAck);
  onSessionAckRef.current = onSessionAck;
  const onElevationCancelledRef = useRef(onElevationCancelled);
  onElevationCancelledRef.current = onElevationCancelled;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const isActiveRef = useRef<boolean>(isActive);
  const suppressAutoFocusRef = useRef<boolean>(suppressAutoFocus);
  const lastDimsRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
  const launchDimsRef = useRef({ cols: launchCols, rows: launchRows });
  const tabMetaRef = useRef({ isAdmin: tab.isAdmin, shellProfile: tab.shellProfile });

  isActiveRef.current = isActive;
  suppressAutoFocusRef.current = suppressAutoFocus;
  launchDimsRef.current = { cols: launchCols, rows: launchRows };
  tabMetaRef.current = { isAdmin: tab.isAdmin, shellProfile: tab.shellProfile };

  const syncPtySize = useCallback(
    (term: Terminal) => {
      const cols = term.cols;
      const rows = term.rows;
      if (
        cols > 0 &&
        rows > 0 &&
        (cols !== lastDimsRef.current.cols || rows !== lastDimsRef.current.rows)
      ) {
        lastDimsRef.current = { cols, rows };
        sessionApi.sessionResizePty(tab.tabId, cols, rows).catch(() => {});
      }
    },
    [tab.tabId]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = createTerminalInstance(launchCols, launchRows);

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon({ highlightLimit: 1000 });
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.open(container);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    let cancelled = false;
    const isCancelled = () => cancelled || terminalRef.current !== term;
    const disposeWebgl = attachWebglRenderer(term, isCancelled);
    const disposeScrollback = bindScrollbackSync(
      term,
      container,
      fitAddon,
      isActiveRef,
      syncPtySize
    );
    bindTerminalShortcuts(term, () => cancelled);

    try {
      fitAddon.fit();
      lastDimsRef.current = { cols: term.cols, rows: term.rows };
    } catch {
      // Ignore initial fit if hidden
    }

    const textEncoder = new TextEncoder();
    const onDataDisposable = term.onData((data) => {
      sessionApi
        .sessionWriteStdin(tab.tabId, Array.from(textEncoder.encode(data)))
        .catch(() => {});
    });

    const onBinaryDisposable = term.onBinary((binaryStr) => {
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i) & 0xff;
      }
      sessionApi.sessionWriteStdin(tab.tabId, Array.from(bytes)).catch(() => {});
    });

    let fitRafId: number | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      if (fitRafId !== null) cancelAnimationFrame(fitRafId);
      fitRafId = requestAnimationFrame(() => {
        fitRafId = null;
        if (isActiveRef.current && fitAddonRef.current && container.clientWidth > 0 && container.clientHeight > 0) {
          try { fitAddonRef.current.fit(); } catch { /* Ignore */ }
        }
      });

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (
          isActiveRef.current &&
          fitAddonRef.current &&
          terminalRef.current &&
          container.clientWidth > 0 &&
          container.clientHeight > 0
        ) {
          try {
            fitAddonRef.current.fit();
            syncPtySize(terminalRef.current);
          } catch {
            // Ignore
          }
        }
      }, RESIZE_DEBOUNCE_MS);
    });
    resizeObserver.observe(container);

    // Defer session spawn to macrotask so StrictMode double-mount cancels before triggering UAC twice.
    const connectTimer = setTimeout(() => {
      if (cancelled) return;
      const initialCols = Math.max(term.cols || launchCols, 20);
      const initialRows = Math.max(term.rows || launchRows, 5);
      const outputChannel = createOutputChannel(term, () => cancelled);

      sessionApi
        .sessionConnect({
          tabId: tab.tabId,
          hostId: tab.hostId,
          cols: initialCols,
          rows: initialRows,
          conflictStrategy: tab.conflictStrategy ?? "AUTO_SHARE_OR_SKIP",
          asAdmin: tab.isAdmin,
          shellProfile: tab.shellProfile,
          onOutput: outputChannel,
        })
        .then((ack) => {
          if (cancelled) return;
          onSessionAckRef.current?.(tab.tabId, ack);
          if (isActiveRef.current) term.focus();
        })
        .catch((err) => {
          if (cancelled) return;
          if (extractRawErrorMessage(err).includes("UAC_CANCELLED")) {
            onElevationCancelledRef.current?.(tab.tabId);
          }
          term.writeln(
            `\r\n\x1b[31m✖ ${formatLocalizedError(err, tRef.current)}\x1b[0m`
          );
        });
    }, 0);

    return () => {
      cancelled = true;
      disposeWebgl();
      disposeScrollback();
      clearTimeout(connectTimer);
      if (fitRafId !== null) cancelAnimationFrame(fitRafId);
      if (debounceTimer) clearTimeout(debounceTimer);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      onBinaryDisposable.dispose();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.tabId, tab.hostId]);

  useEffect(() => {
    if (tab.reconnectToken === 0) return;
    const term = terminalRef.current;
    if (!term) return;

    let cancelled = false;
    try {
      fitAddonRef.current?.fit();
    } catch {
      // Ignore
    }

    const { cols: defCols, rows: defRows } = launchDimsRef.current;
    const { isAdmin, shellProfile } = tabMetaRef.current;
    const cols = Math.max(term.cols || defCols, 20);
    const rows = Math.max(term.rows || defRows, 5);
    const outputChannel = createOutputChannel(
      term,
      () => cancelled || terminalRef.current !== term
    );

    sessionApi
      .sessionReconnect({
        tabId: tab.tabId,
        hostId: tab.hostId,
        cols,
        rows,
        asAdmin: isAdmin,
        shellProfile,
        onOutput: outputChannel,
      })
      .then((ack) => {
        if (cancelled || terminalRef.current !== term) return;
        onSessionAckRef.current?.(tab.tabId, ack);
        if (isActiveRef.current) term.focus();
      })
      .catch((err) => {
        if (cancelled || terminalRef.current !== term) return;
        term.writeln(
          `\r\n\x1b[31m✖ ${formatLocalizedError(err, tRef.current)}\x1b[0m`
        );
      });

    return () => {
      cancelled = true;
    };
  }, [tab.reconnectToken, tab.tabId, tab.hostId]);

  useEffect(() => {
    if (!isActive || suppressAutoFocus) return;
    const raf = window.requestAnimationFrame(() => {
      if (isActiveRef.current && !suppressAutoFocusRef.current) {
        terminalRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isActive, focusToken, suppressAutoFocus, tab.tabId]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      try {
        fitAddonRef.current.fit();
        syncPtySize(terminalRef.current);
        if (isActiveRef.current && !suppressAutoFocusRef.current) {
          terminalRef.current.focus();
        }
      } catch {
        // Ignore
      }
    }, RESIZE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isActive, tab.tabId, syncPtySize]);

  const getContextActions = useCallback((): TerminalContextActions => {
    const term = terminalRef.current;
    const selectionText = term?.getSelection() ?? "";
    return {
      hasSelection: selectionText.length > 0,
      copySelection: async () => {
        if (selectionText) await copyText(selectionText);
        term?.focus();
      },
      pasteClipboard: async () => {
        const text = await readText();
        if (text && term) term.paste(text);
        term?.focus();
      },
      selectAll: () => {
        term?.selectAll();
        term?.focus();
      },
      clear: () => {
        term?.clear();
        term?.focus();
      },
      focus: () => {
        term?.focus();
      },
    };
  }, []);

  return {
    containerRef,
    terminalRef,
    searchAddonRef,
    focus: () => terminalRef.current?.focus(),
    getContextActions,
  };
}
