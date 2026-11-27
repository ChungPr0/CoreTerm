import { useEffect, useRef } from "react";
import { EVENT_UPDATER_PROGRESS } from "@/shared/api/ipcEvents";
import { listenEvent } from "@/shared/api/tauriClient";
import {
  UPDATER_PERIODIC_CHECK_INTERVAL_MS,
  UPDATER_STARTUP_CHECK_DELAY_MS,
} from "@/shared/defaults";
import type { UpdateMode } from "@/modules/settings/types";
import type { UpdateDownloadProgressDto } from "../types";
import { useUpdaterStore } from "./useUpdaterStore";

export function useAutoUpdateCheck(updateMode: UpdateMode) {
  const modeRef = useRef(updateMode);
  modeRef.current = updateMode;

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    listenEvent<UpdateDownloadProgressDto>(EVENT_UPDATER_PROGRESS, (progress) => {
      if (active) {
        useUpdaterStore.getState().setProgress(progress);
      }
    })
      .then((fn) => {
        if (!active) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    void useUpdaterStore.getState().loadEnv();

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (updateMode === "off") return;

    let cancelled = false;

    const runSilentCheck = async () => {
      const store = useUpdaterStore.getState();
      const env = store.envLoaded ? store.env : await store.loadEnv();
      if (cancelled || env.install_kind === "dev") return;
      await store.checkForUpdate({
        updateMode: modeRef.current,
        silent: true,
      });
    };

    // If an NSIS update was already discovered in notify mode and user switches to auto, download immediately.
    const curState = useUpdaterStore.getState();
    if (
      updateMode === "auto" &&
      curState.phase === "available" &&
      curState.latest?.install_kind === "nsis" &&
      curState.latest.can_install_in_app
    ) {
      void curState.downloadUpdate().catch(() => {});
    }

    const startupTimer = window.setTimeout(() => {
      if (!cancelled) void runSilentCheck();
    }, UPDATER_STARTUP_CHECK_DELAY_MS);

    const periodicTimer = window.setInterval(() => {
      if (!cancelled) void runSilentCheck();
    }, UPDATER_PERIODIC_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(periodicTimer);
    };
  }, [updateMode]);
}
