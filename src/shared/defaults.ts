import type { ConflictStrategy, SftpConflictPolicy } from "./types/ipc";

export const LAUNCH_COLS_DEFAULT = 120;
export const LAUNCH_ROWS_DEFAULT = 30;
export const LAUNCH_COLS_MIN = 40;
export const LAUNCH_COLS_MAX = 200;
export const LAUNCH_ROWS_MIN = 10;
export const LAUNCH_ROWS_MAX = 50;

export const DEFAULT_SHELL_ID = "powershell";
export const DEFAULT_SHELL_PRIORITY = ["powershell", "pwsh", "cmd", "git-bash"] as const;
export const DEFAULT_CONFLICT_POLICY: SftpConflictPolicy = "ASK";
export const DEFAULT_CONFLICT_STRATEGY: ConflictStrategy = "AUTO_SHARE_OR_SKIP";
export const DEFAULT_HOST_GROUP = "Default";
export const LOCAL_HOST_ID = "local";

export const STORAGE_KEY_SETTINGS = "coreterm_settings";
export const STORAGE_KEY_FULLSCREEN_TABS_MIGRATION = "coreterm_fullscreen_tabs_v2";
export const STORAGE_KEY_SESSION_SNAPSHOT = "coreterm_session_snapshot";
export const STORAGE_KEY_LOCALE = "coreterm_locale";
export const SESSION_MAX_RESTORE_TABS = 24;

export const UPDATER_STARTUP_CHECK_DELAY_MS = 4000;
export const UPDATER_PERIODIC_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const UPDATER_RELEASES_LATEST_URL =
  "https://github.com/ChungPr0/CoreTerm/releases/latest";

export const EDITOR_FONT_SIZE_DEFAULT = 13;
export const EDITOR_FONT_SIZE_MIN = 10;
export const EDITOR_FONT_SIZE_MAX = 22;
export const EDITOR_TAB_SIZE_DEFAULT = 2;
export const EDITOR_FIND_MAX_MATCHES = 5000;
export const EDITOR_FIND_TIME_BUDGET_MS = 200;
export const EDITOR_SELECTION_SEED_MAX_LEN = 200;

export const TERM_FONT_SIZE_DEFAULT = 16;
export const TERM_FONT_SIZE_MIN = 11;
export const TERM_FONT_SIZE_MAX = 24;
export const TERM_FONT_FAMILY_DEFAULT =
  '"Cascadia Mono", "JetBrains Mono", Consolas, monospace';
export const TERMINAL_FONT_PRESETS = [
  {
    id: "cascadia-mono",
    label: "Cascadia Mono",
    value: TERM_FONT_FAMILY_DEFAULT,
  },
  {
    id: "cascadia-code",
    label: "Cascadia Code",
    value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    value: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "fira-code",
    label: "Fira Code",
    value: '"Fira Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "consolas",
    label: "Consolas",
    value: 'Consolas, "Cascadia Mono", monospace',
  },
  {
    id: "courier-new",
    label: "Courier New",
    value: '"Courier New", Consolas, monospace',
  },
] as const;
export const TERM_LINE_HEIGHT_DEFAULT = 1.0;
export const TERM_LINE_HEIGHT_MIN = 1.0;
export const TERM_LINE_HEIGHT_MAX = 1.6;
export const TERM_SCROLLBACK_DEFAULT = 10000;
export const TERM_SCROLLBACK_MIN = 1000;
export const TERM_SCROLLBACK_MAX = 50000;
export const TERM_PASTE_WARN_BYTES = 5 * 1024;
export const TERM_PASTE_PREVIEW_MAX_LINES = 50;
export const TERM_PASTE_PREVIEW_MAX_CHARS = 4096;
export const TERM_URL_MAX_WRAPPED_SCAN_LINES = 6;
export const TERM_SCROLLBAR_PX = 5;
export const TERM_MIN_COLS = 20;
export const TERM_MIN_ROWS = 5;
export const TERM_LAUNCH_PAD_PX = 2;
export const TERM_DEFAULT_CELL_W = 9.4;
export const TERM_DEFAULT_CELL_H = 19.2;
export const TERM_DEFAULT_CHROME_W = 12;
export const TERM_DEFAULT_CHROME_H = 48;
export const TERM_RESIZE_DEBOUNCE_MS = 60;

export const SSH_DEFAULT_PORT = 22;
export const SSH_DEFAULT_USERNAME = "root";
export const SSH_DEFAULT_KEEPALIVE = 60;
export const SSH_KEEPALIVE_MIN = 0;
export const SSH_KEEPALIVE_MAX = 3600;
export const SSH_DEFAULT_RECONNECT_SEC = 2;
export const SSH_RECONNECT_MIN = 1;
export const SSH_RECONNECT_MAX = 60;
export const SSH_MAX_RECONNECT_BACKOFF_SEC = 30;

export const SFTP_SPLIT_RATIO_DEFAULT = 0.45;
export const SFTP_PANE_SPLIT_DEFAULT = 0.5;
export const SFTP_COL_MIN_WIDTHS = {
  name: 88,
  size: 112,
  mtime: 98,
  perms: 100,
} as const;
export const SFTP_COL_DEFAULT_WIDTHS = {
  size: 116,
  mtime: 132,
  perms: 118,
} as const;
export const SFTP_COL_NAME_MIN_RATIO = 0.34;
export const SFTP_HISTORY_MAX_ENTRIES = 50;
export const SFTP_TRANSFER_PREVIEW_LIMIT = 4;
export const SFTP_MAX_OCTAL_MODE = 0o7777;

export const TOOLTIP_SHOW_DELAY_MS = 500;
export const TOOLTIP_RESHOW_DELAY_MS = 100;
export const TOOLTIP_WARMUP_WINDOW_MS = 300;
export const TOOLTIP_OFFSET_PX = 7;
export const TOOLTIP_VIEWPORT_PAD_PX = 8;
export const TOOLTIP_TOP_ZONE_PX = 64;
export const TOOLTIP_OFFSCREEN_COORD = -9999;

export const PRIVILEGED_PORT_THRESHOLD = 1024;
export const MAX_ENTITY_NAME_LEN = 64;
export const TOAST_COPY_MS = 2000;
export const ALERT_DEFAULT_DURATION_MS = 5000;
export const ALERT_MAX_VISIBLE = 4;

export const THEME_SELECTION_BG = "rgba(56, 189, 248, 0.40)";
export const THEME_SEARCH_MATCH_BG = "rgba(234, 179, 8, 0.28)";
export const THEME_SEARCH_MATCH_BORDER = "rgba(234, 179, 8, 0.60)";
export const THEME_SEARCH_ACTIVE_BG = "rgba(245, 158, 11, 0.60)";
export const THEME_SEARCH_ACTIVE_BORDER = "#f59e0b";

export const SFTP_DISCONNECT_RE =
  /sender dropped|channel closed|disconnected|session not found|still connecting|connection lost/i;

export const SFTP_AUTH_BLOCKED_RE =
  /authentication cancelled|authentication failed|rejected the private key|passphrase|private_key_path|failed to load ssh private key|unsupported auth_method|host key verification|known_hosts|unknown key/i;

/** Clamps launch column count within supported bounds, falling back to default. */
export function clampLaunchCols(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return LAUNCH_COLS_DEFAULT;
  return Math.min(Math.max(Math.round(num), LAUNCH_COLS_MIN), LAUNCH_COLS_MAX);
}

/** Clamps launch row count within supported bounds, falling back to default. */
export function clampLaunchRows(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return LAUNCH_ROWS_DEFAULT;
  return Math.min(Math.max(Math.round(num), LAUNCH_ROWS_MIN), LAUNCH_ROWS_MAX);
}

/** Clamps terminal font size within supported bounds, falling back to default. */
export function clampTermFontSize(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return TERM_FONT_SIZE_DEFAULT;
  return Math.min(Math.max(Math.round(num), TERM_FONT_SIZE_MIN), TERM_FONT_SIZE_MAX);
}

/** Clamps terminal line height within supported bounds, falling back to default. */
export function clampTermLineHeight(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return TERM_LINE_HEIGHT_DEFAULT;
  const clamped = Math.min(Math.max(num, TERM_LINE_HEIGHT_MIN), TERM_LINE_HEIGHT_MAX);
  return Math.round(clamped * 100) / 100;
}

/** Clamps terminal scrollback line count within supported bounds, falling back to default. */
export function clampTermScrollback(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return TERM_SCROLLBACK_DEFAULT;
  return Math.min(Math.max(Math.round(num), TERM_SCROLLBACK_MIN), TERM_SCROLLBACK_MAX);
}

/** Clamps SSH default port within 1..65535, falling back to 22. */
export function clampSshPort(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return SSH_DEFAULT_PORT;
  return Math.min(Math.max(Math.round(num), 1), 65535);
}

/** Clamps SSH default KeepAlive interval (seconds) within 0..3600. */
export function clampSshKeepAlive(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") {
    return SSH_DEFAULT_KEEPALIVE;
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return SSH_DEFAULT_KEEPALIVE;
  return Math.min(Math.max(Math.round(num), SSH_KEEPALIVE_MIN), SSH_KEEPALIVE_MAX);
}

/** Clamps SSH default auto-reconnect interval (seconds) within 1..60. */
export function clampSshReconnectInterval(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return SSH_DEFAULT_RECONNECT_SEC;
  return Math.min(Math.max(Math.round(num), SSH_RECONNECT_MIN), SSH_RECONNECT_MAX);
}

/** Clamps editor default font size within supported bounds, falling back to default. */
export function clampEditorFontSize(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return EDITOR_FONT_SIZE_DEFAULT;
  return Math.min(Math.max(Math.round(num), EDITOR_FONT_SIZE_MIN), EDITOR_FONT_SIZE_MAX);
}
