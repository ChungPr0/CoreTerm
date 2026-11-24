import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EVENT_OPEN_DIRECTORY, EVENT_OPEN_FILE } from "@/shared/api/ipcEvents";
import { listenEvent } from "@/shared/api/tauriClient";
import { useSettingsStore, type AppSettingsValues } from "@/modules/settings";
import {
  calcWinSize,
  mergeShells,
  sessionApi,
  useShellsStore,
  type LaunchWinSize,
} from "@/modules/terminal";
import { useTabsStore, windowApi } from "@/modules/workspace";

interface UseAppBootstrapOpts {
  preloaders: Array<() => Promise<unknown>>;
  localHostLabel: string;
  onFocusTerminal: () => void;
  onOpenDirectory?: () => void;
  onOpenFile?: () => void;
}

export function useAppBootstrap({
  preloaders,
  localHostLabel,
  onFocusTerminal,
  onOpenDirectory,
  onOpenFile,
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
  const localHostLabelRef = useRef(localHostLabel);
  localHostLabelRef.current = localHostLabel;
  const onOpenDirectoryRef = useRef(onOpenDirectory);
  onOpenDirectoryRef.current = onOpenDirectory;
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const onFocusTerminalRef = useRef(onFocusTerminal);
  onFocusTerminalRef.current = onFocusTerminal;
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
        const { tabs, activeTabId } = useTabsStore.getState();
        const activeTab = tabs.find((item) => item.tabId === activeTabId);
        if (activeTab?.tabKind !== "editor" && activeTab?.tabKind !== "sftp") {
          onFocusTerminal();
        }
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

    Promise.all([
      sessionApi.appGetLaunchDir().catch(() => null),
      sessionApi.appGetLaunchFiles().catch(() => [] as string[]),
    ]).then(([dir, files]) => {
      if (cancelled) return;
      if (dir) useTabsStore.getState().setLaunchDir(dir);
      if (files.length > 0) {
        useTabsStore.getState().openLaunchFiles(files, localHostLabelRef.current, {
          replaceInitialLocal: !dir,
          onDisposeTab: (tabId) => {
            sessionApi.sessionDisconnect(tabId).catch(() => {});
          },
        });
        void presentWindow();
      }
    });

    let active = true;
    let unlistenOpenDir: (() => void) | undefined;
    let unlistenOpenFile: (() => void) | undefined;
    listenEvent<string>(EVENT_OPEN_DIRECTORY, (dir) => {
      if (dir) {
        onOpenDirectoryRef.current?.();
        useTabsStore.getState().openDirectoryInTab(dir);
        onFocusTerminalRef.current?.();
      }
    })
      .then((fn) => {
        if (!active) {
          fn();
        } else {
          unlistenOpenDir = fn;
        }
      })
      .catch(() => {});

    listenEvent<string>(EVENT_OPEN_FILE, (filePath) => {
      if (filePath) {
        onOpenFileRef.current?.();
        useTabsStore.getState().openLocalFileInTab(filePath, localHostLabelRef.current);
      }
    })
      .then((fn) => {
        if (!active) {
          fn();
        } else {
          unlistenOpenFile = fn;
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      cancelled = true;
      if (unlistenOpenDir) unlistenOpenDir();
      if (unlistenOpenFile) unlistenOpenFile();
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
