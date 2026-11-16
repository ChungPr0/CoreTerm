import type { SftpConflictPolicy, ShellProfile } from "@/shared/types/ipc";
import type { AppSettingsValues } from "./types";

import {
  clampLaunchCols,
  clampLaunchRows,
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_SHELL_ID,
  LAUNCH_COLS_DEFAULT,
  LAUNCH_ROWS_DEFAULT,
} from "@/shared/defaults";

const SETTINGS_STORAGE_KEY = "coreterm_settings";

function parseShellProfile(
  value: unknown,
  fallbackKind?: string
): ShellProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const executable = typeof obj.executable === "string" ? obj.executable.trim() : "";
  const kind =
    typeof obj.kind === "string" && obj.kind.trim()
      ? obj.kind.trim()
      : fallbackKind ?? "";
  if (
    !id ||
    !kind ||
    !name ||
    !executable ||
    !Array.isArray(obj.args) ||
    !obj.args.every((a) => typeof a === "string")
  ) {
    return undefined;
  }
  return {
    id,
    kind,
    name,
    executable,
    args: obj.args,
  };
}

function parseCustomShells(value: unknown): ShellProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ShellProfile[] = [];
  for (const item of value) {
    const profile = parseShellProfile(item, "custom");
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
  }
  return out;
}

export function parseConflictPolicy(value: unknown): SftpConflictPolicy {
  if (
    value === "OVERWRITE" ||
    value === "SKIP" ||
    value === "RENAME" ||
    value === "RESUME" ||
    value === "ASK"
  ) {
    return value;
  }
  return "ASK";
}

export function loadSettings(): AppSettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        launchCols: clampLaunchCols(parsed.launchCols),
        launchRows: clampLaunchRows(parsed.launchRows),
        sftpConflictPolicy: parseConflictPolicy(parsed.sftpConflictPolicy),
        defaultShellId:
          typeof parsed.defaultShellId === "string" && parsed.defaultShellId.trim()
            ? parsed.defaultShellId.trim()
            : DEFAULT_SHELL_ID,
        defaultShellProfile: parseShellProfile(parsed.defaultShellProfile),
        customShells: parseCustomShells(parsed.customShells),
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    launchCols: LAUNCH_COLS_DEFAULT,
    launchRows: LAUNCH_ROWS_DEFAULT,
    sftpConflictPolicy: DEFAULT_CONFLICT_POLICY,
    defaultShellId: DEFAULT_SHELL_ID,
    customShells: [],
  };
}

export function saveSettings(next: AppSettingsValues): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
