import React, { useEffect, useRef } from "react";
import { Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AlertCircle, RotateCw } from "lucide-react";
import {
  SessionConnectAckDto,
  TelemetryMetricsEventDto,
  TerminalTabItem,
} from "../types/ipc";
import { tauriApi } from "../services/tauriApi";
import { TelemetryBar } from "./TelemetryBar";
import { useI18n } from "../i18n";
import {
  extractRawErrorMessage,
  formatLocalizedError,
} from "../utils/formatError";

export interface TerminalContextActions {
  hasSelection: boolean;
  copySelection: () => Promise<void>;
  pasteClipboard: () => Promise<void>;
  selectAll: () => void;
  clear: () => void;
  focus: () => void;
}

interface TerminalViewportProps {
  tab: TerminalTabItem;
  isActive: boolean;
  launchCols: number;
  launchRows: number;
  showTelemetry: boolean;
  telemetry?: TelemetryMetricsEventDto;
  focusToken?: number;
  suppressAutoFocus?: boolean;
  onReconnect: (tabId: string) => void;
  onToggleAutoReconnect: (tabId: string, enabled: boolean) => void;
  onSessionAck?: (tabId: string, ack: SessionConnectAckDto) => void;
  onElevationCancelled?: (tabId: string) => void;
  onContextMenuTerminal?: (
    e: React.MouseEvent,
    tab: TerminalTabItem,
    actions: TerminalContextActions
  ) => void;
  onContextMenuBanner?: (e: React.MouseEvent, tab: TerminalTabItem) => void;
  onContextMenuTelemetry?: (e: React.MouseEvent, tab: TerminalTabItem) => void;
}

const RESIZE_DEBOUNCE_MS = 60;

async function writeSystemClipboard(text: string): Promise<void> {
  try {
    await tauriApi.clipboardWriteText(text);
  } catch {
    await navigator.clipboard.writeText(text).catch(() => {});
  }
}

async function readSystemClipboard(): Promise<string> {
  try {
    return await tauriApi.clipboardReadText();
  } catch {
    return await navigator.clipboard.readText().catch(() => "");
  }
}

export const TerminalViewport: React.FC<TerminalViewportProps> = ({
  tab,
  isActive,
  launchCols,
  launchRows,
  showTelemetry,
  telemetry,
  focusToken = 0,
  suppressAutoFocus = false,
  onReconnect,
  onToggleAutoReconnect,
  onSessionAck,
  onElevationCancelled,
  onContextMenuTerminal,
  onContextMenuBanner,
  onContextMenuTelemetry,
}) => {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isActiveRef = useRef<boolean>(isActive);
  const suppressAutoFocusRef = useRef<boolean>(suppressAutoFocus);
  const lastDimsRef = useRef<{ cols: number; rows: number }>({
    cols: 0,
    rows: 0,
  });

  isActiveRef.current = isActive;
  suppressAutoFocusRef.current = suppressAutoFocus;

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
      theme: {
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
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    const webglRafId = window.requestAnimationFrame(() => {
      if (cancelled || terminalRef.current !== term) return;
      import("@xterm/addon-webgl")
        .then(({ WebglAddon }) => {
          if (cancelled || terminalRef.current !== term) return;
          try {
            const webglAddon = new WebglAddon();
            webglAddon.onContextLoss(() => {
              webglAddon.dispose();
            });
            term.loadAddon(webglAddon);
          } catch {
            // Fallback to default canvas renderer
          }
        })
        .catch(() => {
          // Fallback to default canvas renderer
        });
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

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
            const cols = term.cols;
            const rows = term.rows;
            if (
              cols > 0 &&
              rows > 0 &&
              (cols !== lastDimsRef.current.cols ||
                rows !== lastDimsRef.current.rows)
            ) {
              lastDimsRef.current = { cols, rows };
              tauriApi.sessionResizePty(tab.tabId, cols, rows).catch(() => {});
            }
          } catch {
            // Ignore resize during write
          }
        }
      }
    };
    syncScrollbackClass();
    const onWriteParsedDisposable = term.onWriteParsed(syncScrollbackClass);
    const onScrollDisposable = term.onScroll(syncScrollbackClass);
    const onResizeScrollDisposable = term.onResize(syncScrollbackClass);

    let cancelled = false;

    // Prevent WebView2 default accelerators on Ctrl+Shift+C/V so paste only fires once via xterm.
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
              if (selected) {
                void writeSystemClipboard(selected);
              }
            } else {
              void readSystemClipboard().then((txt) => {
                if (!cancelled && txt) term.paste(txt);
              });
            }
          }
          return false;
        }
      }
      return true;
    });

    try {
      fitAddon.fit();
      lastDimsRef.current = { cols: term.cols, rows: term.rows };
    } catch {
      // Ignore initial fit if hidden
    }

    const textEncoder = new TextEncoder();
    const onDataDisposable = term.onData((data) => {
      const bytes = textEncoder.encode(data);
      tauriApi.sessionWriteStdin(tab.tabId, Array.from(bytes)).catch(() => {});
    });

    const onBinaryDisposable = term.onBinary((binaryStr) => {
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i) & 0xff;
      }
      tauriApi.sessionWriteStdin(tab.tabId, Array.from(bytes)).catch(() => {});
    });

    // Fit xterm canvas smoothly on animation frames while debouncing backend PTY resize.
    const tryFitTerminal = (): boolean => {
      if (!isActiveRef.current || !fitAddonRef.current || !terminalRef.current) {
        return false;
      }
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        return false;
      }
      try {
        fitAddonRef.current.fit();
        return true;
      } catch {
        // Ignore fit transition
        return false;
      }
    };

    let fitRafId: number | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      if (fitRafId !== null) {
        cancelAnimationFrame(fitRafId);
      }
      fitRafId = requestAnimationFrame(() => {
        fitRafId = null;
        tryFitTerminal();
      });

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (!tryFitTerminal() || !terminalRef.current) return;
        const cols = terminalRef.current.cols;
        const rows = terminalRef.current.rows;
        if (
          cols > 0 &&
          rows > 0 &&
          (cols !== lastDimsRef.current.cols ||
            rows !== lastDimsRef.current.rows)
        ) {
          lastDimsRef.current = { cols, rows };
          tauriApi.sessionResizePty(tab.tabId, cols, rows).catch(() => {});
        }
      }, RESIZE_DEBOUNCE_MS);
    });

    resizeObserver.observe(container);

    // Defer session spawn to macrotask so React StrictMode dev double-mount cancels before triggering UAC twice.
    const connectTimer = setTimeout(() => {
      if (cancelled) return;
      const initialCols = Math.max(term.cols || launchCols, 20);
      const initialRows = Math.max(term.rows || launchRows, 5);

      const outputChannel = new Channel<number[] | Uint8Array>();
      outputChannel.onmessage = (chunk) => {
        if (cancelled) return;
        const bytes =
          chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        term.write(bytes);
      };

      tauriApi
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
          onSessionAck?.(tab.tabId, ack);
          if (isActiveRef.current) {
            term.focus();
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (extractRawErrorMessage(err).includes("UAC_CANCELLED")) {
            onElevationCancelled?.(tab.tabId);
          }
          term.writeln(
            `\r\n\x1b[31m✖ ${formatLocalizedError(err, tRef.current)}\x1b[0m`
          );
        });
    }, 0);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(webglRafId);
      clearTimeout(connectTimer);
      if (fitRafId !== null) {
        cancelAnimationFrame(fitRafId);
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      resizeObserver.disconnect();
      onWriteParsedDisposable.dispose();
      onScrollDisposable.dispose();
      onResizeScrollDisposable.dispose();
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

    const outputChannel = new Channel<number[] | Uint8Array>();
    outputChannel.onmessage = (chunk) => {
      const bytes =
        chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      term.write(bytes);
    };

    tauriApi
      .sessionReconnect({
        tabId: tab.tabId,
        hostId: tab.hostId,
        cols,
        rows,
        asAdmin: tab.isAdmin,
        onOutput: outputChannel,
      })
      .then((ack) => {
        onSessionAck?.(tab.tabId, ack);
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
    onSessionAck,
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
        const cols = terminalRef.current.cols;
        const rows = terminalRef.current.rows;
        if (
          cols > 0 &&
          rows > 0 &&
          (cols !== lastDimsRef.current.cols ||
            rows !== lastDimsRef.current.rows)
        ) {
          lastDimsRef.current = { cols, rows };
          tauriApi.sessionResizePty(tab.tabId, cols, rows).catch(() => {});
        }
        if (isActiveRef.current && !suppressAutoFocusRef.current) {
          terminalRef.current.focus();
        }
      } catch {
        // Ignore
      }
    }, RESIZE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isActive, tab.tabId]);

  useEffect(() => {
    if (
      tab.hostId === "local" ||
      !tab.autoReconnect ||
      (tab.state !== "DISCONNECTED" && tab.state !== "ERROR")
    ) {
      return;
    }
    const delayMs = Math.max(tab.reconnectIntervalSec ?? 2, 1) * 1000;
    const timer = setTimeout(() => {
      onReconnect(tab.tabId);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [
    tab.hostId,
    tab.autoReconnect,
    tab.reconnectIntervalSec,
    tab.state,
    tab.tabId,
    onReconnect,
  ]);

  const handleTerminalContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenuTerminal) return;
    e.preventDefault();
    e.stopPropagation();

    const term = terminalRef.current;
    const selectionText = term?.getSelection() ?? "";
    const actions: TerminalContextActions = {
      hasSelection: selectionText.length > 0,
      copySelection: async () => {
        if (selectionText) {
          await writeSystemClipboard(selectionText);
        }
        term?.focus();
      },
      pasteClipboard: async () => {
        const text = await readSystemClipboard();
        if (text && term) {
          term.paste(text);
        }
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
    onContextMenuTerminal(e, tab, actions);
  };

  const isDisconnected =
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED" ||
    tab.state === "PORT_CONFLICT";

  return (
    <div
      style={{ display: isActive ? "flex" : "none" }}
      className="flex-1 flex flex-col h-full w-full bg-[#090d16] overflow-hidden relative"
    >
      {isDisconnected && (
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenuBanner?.(e, tab);
          }}
          className="px-4 py-2 bg-rose-950/70 border-b border-rose-800/60 flex items-center justify-between text-xs text-rose-200 shrink-0 select-none"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              {t("status.disconnected")} ({tab.state})
              {tab.errorMessage
                ? ` — ${formatLocalizedError(tab.errorMessage, t)}`
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {tab.hostId !== "local" && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-rose-200">
                <input
                  type="checkbox"
                  checked={!!tab.autoReconnect}
                  onChange={(e) =>
                    onToggleAutoReconnect(tab.tabId, e.target.checked)
                  }
                />
                <span>{t("session.auto_reconnect")}</span>
              </label>
            )}
            <button
              type="button"
              onClick={() => onReconnect(tab.tabId)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{t("session.reconnect")}</span>
            </button>
          </div>
        </div>
      )}

      <div
        onClick={() => terminalRef.current?.focus()}
        onContextMenu={handleTerminalContextMenu}
        className="flex-1 w-full h-full p-1.5 overflow-hidden bg-[#090d16]"
      >
        <div
          ref={containerRef}
          className="w-full h-full overflow-hidden xterm-no-scrollback bg-[#090d16]"
        />
      </div>

      {/* Fixed bottom-right CPU & RAM bar when enabled */}
      {showTelemetry && (
        <div className="absolute bottom-2.5 right-4 z-20">
          <TelemetryBar
            metrics={telemetry}
            sessionState={tab.state}
            onContextMenu={(e) => onContextMenuTelemetry?.(e, tab)}
          />
        </div>
      )}
    </div>
  );
};
