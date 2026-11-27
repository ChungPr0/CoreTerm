import { invoke } from "@/shared/api/tauriClient";
import type {
  AppUpdateEnvDto,
  UpdateCheckResultDto,
  UpdateDownloadResultDto,
} from "../types";

export const updaterApi = {
  updaterGetInfo(): Promise<AppUpdateEnvDto> {
    return invoke<AppUpdateEnvDto>("updater_get_info", {});
  },

  updaterCheck(): Promise<UpdateCheckResultDto> {
    return invoke<UpdateCheckResultDto>("updater_check", {});
  },

  updaterDownload(): Promise<UpdateDownloadResultDto> {
    return invoke<UpdateDownloadResultDto>("updater_download", {});
  },

  updaterInstall(): Promise<void> {
    return invoke<void>("updater_install", {});
  },
};
