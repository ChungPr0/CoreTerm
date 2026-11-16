import type { SftpConflictPolicy, ShellProfile } from "@/shared/types/ipc";

export interface AppSettingsValues {
  launchCols: number;
  launchRows: number;
  sftpConflictPolicy: SftpConflictPolicy;
  defaultShellId: string;
  defaultShellProfile?: ShellProfile;
}
