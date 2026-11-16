import { create } from "zustand";
import type { ShellProfile } from "@/shared/types/ipc";
import { loadSettings, saveSettings } from "./settingsStorage";
import type { AppSettingsValues } from "./types";

interface SettingsStoreState {
  settings: AppSettingsValues;
  updateSettings: (next: AppSettingsValues) => void;
  addCustomShell: (profile: ShellProfile, makeDefault?: boolean) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: loadSettings(),
  updateSettings: (next) => {
    saveSettings(next);
    set({ settings: next });
  },
  addCustomShell: (profile, makeDefault = false) =>
    set((s) => {
      const existingIdx = s.settings.customShells.findIndex((c) => c.id === profile.id);
      const customShells =
        existingIdx >= 0
          ? s.settings.customShells.map((c, i) => (i === existingIdx ? profile : c))
          : [...s.settings.customShells, profile];
      const next: AppSettingsValues = {
        ...s.settings,
        customShells,
        ...(makeDefault
          ? { defaultShellId: profile.id, defaultShellProfile: profile }
          : {}),
      };
      saveSettings(next);
      return { settings: next };
    }),
}));
