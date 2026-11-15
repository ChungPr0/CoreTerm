import { create } from "zustand";
import { loadSettings, saveSettings } from "./settingsStorage";
import type { AppSettingsValues } from "./types";

interface SettingsStoreState {
  settings: AppSettingsValues;
  updateSettings: (next: AppSettingsValues) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: loadSettings(),
  updateSettings: (next) => {
    saveSettings(next);
    set({ settings: next });
  },
}));
