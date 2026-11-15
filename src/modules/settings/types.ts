import type { SftpConflictPolicy } from "@/shared/types/ipc";

export interface AppSettingsValues {
  launchCols: number;
  launchRows: number;
  showLocalTelemetry: boolean;
  telemetryIntervalSec: number;
  sftpConflictPolicy: SftpConflictPolicy;
}
