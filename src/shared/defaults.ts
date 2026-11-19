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
