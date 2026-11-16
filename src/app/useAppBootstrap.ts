import { useCallback, useEffect, useState } from "react";
import { useSettingsStore, type AppSettingsValues } from "@/modules/settings";
import { useShellsStore } from "@/modules/terminal";
import { useTabsStore, windowApi } from "@/modules/workspace";

interface UseAppBootstrapOpts {
  preloaders: Array<() => Promise<unknown>>;
  onFocusTerminal: () => void;
}

export function useAppBootstrap({
  preloaders,
  onFocusTerminal,
}: UseAppBootstrapOpts) {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const shellProfiles = useShellsStore((s) => s.shells);
  const [isAppElevated, setIsAppElevated] = useState(false);
  const [hasNativeBorder, setHasNativeBorder] = useState(false);

  useEffect(() => {
    const customSize = settings.launchCols !== 120 || settings.launchRows !== 30;
    let cancelled = false;

    const presentTimer = window.setTimeout(() => {
      if (cancelled) return;
      windowApi
        .windowPresent(
          customSize ? { cols: settings.launchCols, rows: settings.launchRows } : undefined
        )
        .then(() => {
          if (!cancelled) onFocusTerminal();
        })
        .catch(() => {});
    }, 0);

    const preloadTimer = window.setTimeout(() => {
      if (!cancelled) preloaders.forEach((load) => void load().catch(() => {}));
    }, 150);

    void useShellsStore.getState().detectShells();

    windowApi
      .appGetStatus()
      .then((status) => {
        setIsAppElevated(status.is_elevated);
        setHasNativeBorder(status.has_native_border);
        if (status.is_elevated) useTabsStore.getState().markLocalTabsAdmin();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.clearTimeout(presentTimer);
      window.clearTimeout(preloadTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAndApplySettings = useCallback(
    (next: AppSettingsValues) => {
      updateSettings(next);
      windowApi.windowSetLaunchSize(next.launchCols, next.launchRows).catch(() => {});
    },
    [updateSettings]
  );

  return {
    settings,
    shellProfiles,
    isAppElevated,
    hasNativeBorder,
    saveAndApplySettings,
  };
}
