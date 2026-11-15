import type { SftpConflictPolicy } from "@/shared/types/ipc";
import type { AppSettingsValues } from "./types";

const SETTINGS_STORAGE_KEY = "coreterm_settings";

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
        showLocalTelemetry:
          typeof parsed.showLocalTelemetry === "boolean"
            ? parsed.showLocalTelemetry
            : false,
        telemetryIntervalSec: Math.min(
          Math.max(Number(parsed.telemetryIntervalSec) || 2, 1),
          60
        ),
        sftpConflictPolicy: parseConflictPolicy(parsed.sftpConflictPolicy),
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    launchCols: 120,
    launchRows: 30,
    showLocalTelemetry: false,
    telemetryIntervalSec: 2,
    sftpConflictPolicy: "ASK",
  };
}

export function saveSettings(next: AppSettingsValues): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
