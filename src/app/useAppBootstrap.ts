import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettingsStore, type AppSettingsValues } from "@/modules/settings";
import {
  calcWinSize,
  mergeShells,
  useShellsStore,
  type LaunchWinSize,
} from "@/modules/terminal";
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
  const addCustomShell = useSettingsStore((s) => s.addCustomShell);
  const detectedShells = useShellsStore((s) => s.shells);
  const isShellsLoaded = useShellsStore((s) => s.isLoaded);
  const shellProfiles = useMemo(
    () => mergeShells(detectedShells, settings.customShells),
    [detectedShells, settings.customShells]
  );
  const [isAppElevated, setIsAppElevated] = useState(false);
  const [hasNativeBorder, setHasNativeBorder] = useState(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const presentedRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  const presentWindow = useCallback(
    async (size?: Partial<LaunchWinSize>): Promise<boolean> => {
      if (presentedRef.current) return false;
      presentedRef.current = true;
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      const cols = size?.cols ?? settingsRef.current.launchCols;
      const rows = size?.rows ?? settingsRef.current.launchRows;
      const fallback = calcWinSize(cols, rows);
      try {
        await windowApi.windowPresent({
          cols,
          rows,
          width: size?.width ?? fallback.width,
          height: size?.height ?? fallback.height,
        });
        onFocusTerminal();
      } catch {
        // Ignore in non-Tauri preview
      }
      return true;
    },
    [onFocusTerminal]
  );

  useEffect(() => {
    let cancelled = false;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (!cancelled) void presentWindow();
    }, 900);

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
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      window.clearTimeout(preloadTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAndApplySettings = useCallback(
    (next: AppSettingsValues) => {
      updateSettings(next);
      const winSize = calcWinSize(next.launchCols, next.launchRows);
      windowApi
        .windowSetLaunchSize(next.launchCols, next.launchRows, winSize.width, winSize.height)
        .catch(() => {});
    },
    [updateSettings]
  );

  return {
    settings,
    shellProfiles,
    isShellsLoaded,
    isAppElevated,
    hasNativeBorder,
    addCustomShell,
    presentWindow,
    saveAndApplySettings,
  };
}
