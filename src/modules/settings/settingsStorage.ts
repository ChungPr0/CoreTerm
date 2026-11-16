import type { SftpConflictPolicy, ShellProfile } from "@/shared/types/ipc";
import type { AppSettingsValues } from "./types";

const SETTINGS_STORAGE_KEY = "coreterm_settings";

function parseShellProfile(value: unknown): ShellProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.kind !== "string" ||
    typeof obj.name !== "string" ||
    typeof obj.executable !== "string" ||
    !Array.isArray(obj.args) ||
    !obj.args.every((a) => typeof a === "string")
  ) {
    return undefined;
  }
  return {
    id: obj.id,
    kind: obj.kind,
    name: obj.name,
    executable: obj.executable,
    args: obj.args,
  };
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
        launchCols: Number(parsed.launchCols) || 120,
        launchRows: Number(parsed.launchRows) || 30,
        sftpConflictPolicy: parseConflictPolicy(parsed.sftpConflictPolicy),
        defaultShellId:
          typeof parsed.defaultShellId === "string" && parsed.defaultShellId.trim()
            ? parsed.defaultShellId.trim()
            : "powershell",
        defaultShellProfile: parseShellProfile(parsed.defaultShellProfile),
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    launchCols: 120,
    launchRows: 30,
    sftpConflictPolicy: "ASK",
    defaultShellId: "powershell",
  };
}

export function saveSettings(next: AppSettingsValues): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
