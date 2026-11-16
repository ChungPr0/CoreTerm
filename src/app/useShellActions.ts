import { useCallback } from "react";
import type { ShellProfile } from "@/shared/types/ipc";
import type { AppSettingsValues } from "@/modules/settings";
import {
  makeCustomShell,
  mergeShells,
  resolveDefaultShell,
  sessionApi,
  shellNameFromPath,
  useShellsStore,
} from "@/modules/terminal";

interface UseShellActionsOpts {
  t: (key: string) => string;
  settings: AppSettingsValues;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  addCustomShell: (profile: ShellProfile, makeDefault?: boolean) => void;
  switchTabShell: (tabId: string, profile: ShellProfile) => void;
  reconnectTab: (tabId: string) => void;
  onError: (msg: string) => void;
}

export function useShellActions({
  t,
  settings,
  shellProfiles,
  defaultShellProfile,
  addCustomShell,
  switchTabShell,
  reconnectTab,
  onError,
}: UseShellActionsOpts) {
  const rescanShells = useCallback(
    async (tabId?: string) => {
      const detected = await useShellsStore.getState().detectShells(true);
      if (!tabId) return;
      const merged = mergeShells(detected, settings.customShells);
      const fallback = resolveDefaultShell(merged, settings.defaultShellId);
      if (fallback) {
        switchTabShell(tabId, fallback);
      } else {
        reconnectTab(tabId);
      }
    },
    [reconnectTab, settings.customShells, settings.defaultShellId, switchTabShell]
  );

  const pickShellForTab = useCallback(
    async (tabId: string) => {
      try {
        const picked = await sessionApi.pickShellExe(undefined, {
          executable: t("settings.file_filter_exe"),
          allFiles: t("settings.file_filter_all"),
        });
        if (!picked) return;
        const resolved = await sessionApi.checkShellExe(picked);
        if (!resolved) {
          onError(t("terminal.shell_invalid"));
          return;
        }
        const profile = makeCustomShell({
          name: shellNameFromPath(resolved, t("settings.custom_shell_fallback")),
          executable: resolved,
        });
        addCustomShell(profile, shellProfiles.length === 0 || !defaultShellProfile);
        switchTabShell(tabId, profile);
      } catch {
        // User closed picker
      }
    },
    [
      addCustomShell,
      defaultShellProfile,
      onError,
      shellProfiles.length,
      switchTabShell,
      t,
    ]
  );

  return { rescanShells, pickShellForTab };
}
