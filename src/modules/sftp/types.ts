import type {
  FileContentDto,
  FileWriteResultDto,
  SftpConflictPolicy,
  SftpConnectionState,
} from "@/shared/types/ipc";

export type SftpTransferStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export type {
  FileContentDto,
  FileWriteResultDto,
  SftpConflictPolicy,
  SftpConnectionState,
};

export interface SftpConnectAckDto {
  tab_id: string;
  host_id: string;
  home_path: string;
  cwd: string;
  drives?: LocalDriveDto[];
}

export interface SftpStatusEventDto {
  tab_id: string;
  host_id: string;
  state: SftpConnectionState;
  cwd?: string | null;
  error_message?: string | null;
}

export interface SftpAuthPromptEventDto {
  tab_id: string;
  host_id: string;
  prompt_type: "PASSWORD" | "KEY_PASSPHRASE";
  prompt_text: string;
  attempt: number;
}

export interface SftpHostKeyPromptEventDto {
  tab_id: string;
  host_id: string;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  reason: string;
}

export interface SftpEntryDto {
  name: string;
  path: string;
  kind: "DIR" | "FILE" | "SYMLINK" | "OTHER";
  symlink_target_is_dir: boolean;
  size: number;
  mtime_ms?: number | null;
  permissions?: number | null;
  permissions_display: string;
  owner?: string | null;
  group?: string | null;
}

export interface SftpListDirResultDto {
  path: string;
  entries: SftpEntryDto[];
}

export interface LocalDriveDto {
  name: string;
  path: string;
}

export interface LocalFsEntryDto {
  name: string;
  path: string;
  kind: "DIR" | "FILE" | "SYMLINK" | "OTHER";
  size: number;
  mtime_ms?: number | null;
  is_readonly: boolean;
}

export interface LocalListDirResultDto {
  path: string;
  entries: LocalFsEntryDto[];
}

export interface SftpTransferJobDto {
  job_id: string;
  tab_id: string;
  direction: "UPLOAD" | "DOWNLOAD";
  source_path: string;
  dest_path: string;
  file_name: string;
  total_bytes: number;
  transferred_bytes: number;
  speed_bps: number;
  status: SftpTransferStatus;
  error_message?: string | null;
}

export interface SftpTransferConflictEventDto {
  conflict_id: string;
  tab_id: string;
  job_id: string;
  direction: "UPLOAD" | "DOWNLOAD";
  file_name: string;
  source_path: string;
  dest_path: string;
  source_size: number;
  source_mtime_ms?: number | null;
  dest_size: number;
  dest_mtime_ms?: number | null;
  can_resume: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  mtimeMs?: number | null;
  mode?: number | null;
  perms?: string;
}
