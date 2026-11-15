import { useCallback, useEffect, useRef } from "react";
import { Channel } from "@/shared/api/tauriClient";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
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

const XTERM_THEME = {
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
  const isActiveRef = useRef<boolean>(isActive);
  const suppressAutoFocusRef = useRef<boolean>(suppressAutoFocus);
  const lastDimsRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });

  isActiveRef.current = isActive;
  suppressAutoFocusRef.current = suppressAutoFocus;

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

  const createOutputChannel = useCallback((term: Terminal, isCancelled: () => boolean) => {
    const channel = new Channel<number[] | Uint8Array>();
    channel.onmessage = (chunk) => {
      if (isCancelled()) return;
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      term.write(bytes);
    };
    return channel;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cols: launchCols,
      rows: launchRows,
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

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.tabId, tab.hostId]);

  useEffect(() => {
    if (tab.reconnectToken === 0) return;
    const term = terminalRef.current;
    if (!term) return;

    try {
      fitAddonRef.current?.fit();
    } catch {
      // Ignore
    }

    const cols = Math.max(term.cols || launchCols, 20);
    const rows = Math.max(term.rows || launchRows, 5);
    const outputChannel = createOutputChannel(term, () => false);

    sessionApi
      .sessionReconnect({
        tabId: tab.tabId,
        hostId: tab.hostId,
        cols,
        rows,
        asAdmin: tab.isAdmin,
        onOutput: outputChannel,
      })
      .then((ack) => {
        onSessionAckRef.current?.(tab.tabId, ack);
        term.focus();
      })
      .catch((err) => {
        term.writeln(
          `\r\n\x1b[31m✖ ${formatLocalizedError(err, tRef.current)}\x1b[0m`
        );
      });
  }, [
    tab.reconnectToken,
    tab.tabId,
    tab.hostId,
    tab.isAdmin,
    launchCols,
    launchRows,
    createOutputChannel,
  ]);

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
    focus: () => terminalRef.current?.focus(),
    getContextActions,
  };
}
