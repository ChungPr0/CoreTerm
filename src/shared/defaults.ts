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

export const EDITOR_FONT_SIZE_DEFAULT = 13;
export const EDITOR_FONT_SIZE_MIN = 10;
export const EDITOR_FONT_SIZE_MAX = 22;
export const EDITOR_FIND_MAX_MATCHES = 5000;
export const EDITOR_FIND_TIME_BUDGET_MS = 25;
export const EDITOR_SELECTION_SEED_MAX_LEN = 200;

export const SFTP_SPLIT_RATIO_DEFAULT = 0.45;
export const SFTP_PANE_SPLIT_DEFAULT = 0.5;
export const PRIVILEGED_PORT_THRESHOLD = 1024;
export const MAX_ENTITY_NAME_LEN = 64;
export const TOAST_COPY_MS = 2000;

export const SFTP_DISCONNECT_RE =
  /sender dropped|channel closed|disconnected|session not found|still connecting|connection lost/i;

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
