import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EVENT_OPEN_DIRECTORY,
  EVENT_OPEN_FILE,
  EVENT_OPEN_NEW_TAB,
  EVENT_WINDOW_CLOSE_REQUESTED,
} from "@/shared/api/ipcEvents";
import { invoke, listenEvent } from "@/shared/api/tauriClient";
import { useSettingsStore } from "@/modules/settings";
import {
  calcWinSize,
  mergeShells,
  sessionApi,
  useShellsStore,
  type LaunchWinSize,
} from "@/modules/terminal";
import { useTabsStore, windowApi } from "@/modules/workspace";
import {
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "@/modules/workspace/utils/sessionStorage";

interface UseAppBootstrapOpts {
  preloaders: Array<() => Promise<unknown>>;
  localHostLabel: string;
  onFocusTerminal: () => void;
  onOpenDirectory?: () => void;
  onOpenFile?: () => void;
  onOpenNewTab?: () => void;
  onRequestCloseWindow?: () => void;
}

export function useAppBootstrap({
  preloaders,
  localHostLabel,
  onFocusTerminal,
  onOpenDirectory,
  onOpenFile,
  onOpenNewTab,
  onRequestCloseWindow,
}: UseAppBootstrapOpts) {
  const settings = useSettingsStore((s) => s.settings);
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
  const onOpenNewTabRef = useRef(onOpenNewTab);
  onOpenNewTabRef.current = onOpenNewTab;
  const onRequestCloseWindowRef = useRef(onRequestCloseWindow);
  onRequestCloseWindowRef.current = onRequestCloseWindow;
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
      const curSettings = settingsRef.current;
      const cols = size?.cols ?? curSettings.launchCols;
      const rows = size?.rows ?? curSettings.launchRows;
      const fallback = calcWinSize(cols, rows);
      try {
        await windowApi.windowPresent({
          cols,
          rows,
          width: size?.width ?? fallback.width,
          height: size?.height ?? fallback.height,
          launchMode: curSettings.launchMode,
          centerOnLaunch: curSettings.centerOnLaunch,
          alwaysOnTop: curSettings.alwaysOnTop,
        });
        if (curSettings.defaultImeMode === "alphanumeric") {
          windowApi.windowApplyImeMode("alphanumeric").catch(() => {});
        }
        const { tabs, activeTabId } = useTabsStore.getState();
        const activeTab = tabs.find((item) => item.tabId === activeTabId);
        if (
          activeTab?.tabKind !== "editor" &&
          activeTab?.tabKind !== "sftp" &&
          activeTab?.tabKind !== "settings"
        ) {
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
    windowApi.windowSetAlwaysOnTop(settings.alwaysOnTop).catch(() => {});
  }, [settings.alwaysOnTop]);

  useEffect(() => {
    windowApi.startupSyncPrefs(settings.newInstanceBehavior).catch(() => {});
  }, [settings.newInstanceBehavior]);

  useEffect(() => {
    if (settings.defaultImeMode === "alphanumeric") {
      windowApi.windowApplyImeMode("alphanumeric").catch(() => {});
    }
  }, [settings.defaultImeMode]);

  useEffect(() => {
    let cancelled = false;
    let snapshotTrackingReady = false;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (!cancelled) void presentWindow();
    }, 900);

    const preloadTimer = window.setTimeout(() => {
      if (!cancelled) preloaders.forEach((load) => void load().catch(() => {}));
    }, 150);

    void useShellsStore.getState().detectShells();

    const elevatedPromise = windowApi
      .appGetStatus()
      .then((status) => {
        setIsAppElevated(status.is_elevated);
        setHasNativeBorder(status.has_native_border);
        if (status.is_elevated) useTabsStore.getState().markLocalTabsAdmin();
        return status.is_elevated;
      })
      .catch(() => false);

    Promise.all([
      sessionApi.appGetLaunchDir().catch(() => null),
      sessionApi.appGetLaunchFiles().catch(() => [] as string[]),
      elevatedPromise,
    ]).then(async ([dir, files, elevated]) => {
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
      } else if (!dir && settingsRef.current.startupBehavior === "restore_session") {
        const snapshot = loadSessionSnapshot();
        if (snapshot && snapshot.tabs.length > 0) {
          const profiles = await invoke<Array<{ id: string }>>("host_list", {}).catch(
            () => null
          );
          if (cancelled) return;
          const validHostIds = profiles
            ? new Set(profiles.map((p) => p.id))
            : undefined;
          const restored = useTabsStore.getState().restoreSessionTabs(snapshot, {
            validHostIds,
            isAppElevated: elevated,
            onDisposeTab: (tabId) => {
              sessionApi.sessionDisconnect(tabId).catch(() => {});
            },
          });
          if (restored) {
            const { tabs, activeTabId } = useTabsStore.getState();
            const active = tabs.find((item) => item.tabId === activeTabId);
            if (
              active?.tabKind === "editor" ||
              active?.tabKind === "sftp"
            ) {
              void presentWindow();
            }
          }
        }
      }

      if (cancelled) return;
      snapshotTrackingReady = true;
      const curState = useTabsStore.getState();
      if (curState.tabs.some((t) => t.tabKind !== "settings")) {
        saveSessionSnapshot(curState.tabs, curState.activeTabId);
      }
    });

    const unsubscribeSnapshot = useTabsStore.subscribe((state) => {
      if (!snapshotTrackingReady) return;
      if (state.tabs.some((t) => t.tabKind !== "settings")) {
        saveSessionSnapshot(state.tabs, state.activeTabId);
      }
    });

    let active = true;
    let unlistenOpenDir: (() => void) | undefined;
    let unlistenOpenFile: (() => void) | undefined;
    let unlistenOpenNewTab: (() => void) | undefined;
    let unlistenCloseReq: (() => void) | undefined;
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

    listenEvent(EVENT_OPEN_NEW_TAB, () => {
      onOpenNewTabRef.current?.();
    })
      .then((fn) => {
        if (!active) {
          fn();
        } else {
          unlistenOpenNewTab = fn;
        }
      })
      .catch(() => {});

    listenEvent(EVENT_WINDOW_CLOSE_REQUESTED, () => {
      if (onRequestCloseWindowRef.current) {
        onRequestCloseWindowRef.current();
      } else {
        windowApi.windowClose().catch(() => {});
      }
    })
      .then((fn) => {
        if (!active) {
          fn();
        } else {
          unlistenCloseReq = fn;
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      cancelled = true;
      unsubscribeSnapshot();
      if (unlistenOpenDir) unlistenOpenDir();
      if (unlistenOpenFile) unlistenOpenFile();
      if (unlistenOpenNewTab) unlistenOpenNewTab();
      if (unlistenCloseReq) unlistenCloseReq();
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      window.clearTimeout(preloadTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    settings,
    shellProfiles,
    isShellsLoaded,
    isAppElevated,
    hasNativeBorder,
    addCustomShell,
    presentWindow,
  };
}
