export type InstallKind = "dev" | "nsis" | "msi" | "portable";

export type UpdaterPhase =
  | "idle"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface AppUpdateEnvDto {
  current_version: string;
  install_kind: InstallKind;
  can_install_in_app: boolean;
  supports_silent_auto_download: boolean;
}

export interface UpdateCheckResultDto {
  available: boolean;
  current_version: StringOrPrimitive;
  install_kind: InstallKind;
  version?: string | null;
  tag_name?: string | null;
  release_notes?: string | null;
  published_at?: string | null;
  release_url?: string | null;
  asset_name?: string | null;
  asset_size?: number | null;
  can_install_in_app: boolean;
  is_downloaded: boolean;
}

type StringOrPrimitive = string;

export interface UpdateDownloadProgressDto {
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export interface UpdateDownloadResultDto {
  version: string;
  ready: boolean;
}
