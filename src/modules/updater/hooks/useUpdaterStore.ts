import { create } from "zustand";
import type { UpdateMode } from "@/modules/settings/types";
import { updaterApi } from "../api/updaterApi";
import type {
  AppUpdateEnvDto,
  UpdateCheckResultDto,
  UpdateDownloadProgressDto,
  UpdaterPhase,
} from "../types";

const DEFAULT_ENV: AppUpdateEnvDto = {
  current_version: "0.5.4",
  install_kind: "portable",
  can_install_in_app: false,
  supports_silent_auto_download: false,
};

interface CheckOptions {
  updateMode?: UpdateMode;
  silent?: boolean;
}

interface UpdaterStoreState {
  env: AppUpdateEnvDto;
  envLoaded: boolean;
  phase: UpdaterPhase;
  latest: UpdateCheckResultDto | null;
  progress: UpdateDownloadProgressDto | null;
  errorMessage: string | null;
  isModalOpen: boolean;
  loadEnv: () => Promise<AppUpdateEnvDto>;
  checkForUpdate: (opts?: CheckOptions) => Promise<UpdateCheckResultDto | null>;
  downloadUpdate: () => Promise<boolean>;
  setProgress: (progress: UpdateDownloadProgressDto) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useUpdaterStore = create<UpdaterStoreState>((set, get) => ({
  env: DEFAULT_ENV,
  envLoaded: false,
  phase: "idle",
  latest: null,
  progress: null,
  errorMessage: null,
  isModalOpen: false,

  loadEnv: async () => {
    try {
      const env = await updaterApi.updaterGetInfo();
      set({ env, envLoaded: true });
      return env;
    } catch {
      set({ envLoaded: true });
      return get().env;
    }
  },

  checkForUpdate: async (opts) => {
    const curPhase = get().phase;
    if (curPhase === "checking" || curPhase === "downloading") {
      return get().latest;
    }

    set({ phase: "checking", errorMessage: null });
    try {
      const res = await updaterApi.updaterCheck();
      set((state) => ({
        env: {
          ...state.env,
          current_version: res.current_version,
          install_kind: res.install_kind,
          can_install_in_app:
            res.install_kind === "nsis" || res.install_kind === "msi",
          supports_silent_auto_download: res.install_kind === "nsis",
        },
        envLoaded: true,
      }));

      if (!res.available || !res.version) {
        set({
          latest: res,
          phase: "up_to_date",
          progress: null,
          errorMessage: null,
        });
        return res;
      }

      if (res.is_downloaded && res.can_install_in_app) {
        set({
          latest: res,
          phase: "ready",
          progress: null,
          errorMessage: null,
        });
        return res;
      }

      set({
        latest: res,
        phase: "available",
        progress: null,
        errorMessage: null,
      });

      const shouldAutoDownload =
        opts?.updateMode === "auto" &&
        res.install_kind === "nsis" &&
        res.can_install_in_app;
      if (shouldAutoDownload) {
        void get().downloadUpdate();
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        phase: state.latest?.available
          ? state.latest.is_downloaded
            ? "ready"
            : "available"
          : "error",
        errorMessage: msg,
      }));
      if (!opts?.silent) {
        throw err;
      }
      return null;
    }
  },

  downloadUpdate: async () => {
    const { latest, phase } = get();
    if (!latest?.available || !latest.can_install_in_app) return false;
    if (phase === "downloading") return false;
    if (phase === "ready" && latest.is_downloaded) return true;

    set({
      phase: "downloading",
      errorMessage: null,
      progress: {
        downloaded_bytes: 0,
        total_bytes: latest.asset_size ?? 0,
        percent: 0,
      },
    });

    try {
      await updaterApi.updaterDownload();
      set((state) => ({
        phase: "ready",
        progress: null,
        latest: state.latest ? { ...state.latest, is_downloaded: true } : null,
      }));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        phase: "available",
        progress: null,
        errorMessage: msg,
      });
      throw err;
    }
  },

  setProgress: (progress) => {
    set((state) =>
      state.phase === "downloading" ? { progress } : state
    );
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
