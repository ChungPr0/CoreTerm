import { create } from "zustand";
import type { SettingsCategoryId, ShellProfile } from "@/shared/types/ipc";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from "./settingsStorage";
import type { AppSettingsValues } from "./types";

const CATEGORY_KEYS: Record<SettingsCategoryId, Array<keyof AppSettingsValues>> = {
  general: ["closeLastTabBehavior"],
  startup: [
    "launchCols",
    "launchRows",
    "defaultImeMode",
    "startupBehavior",
    "newInstanceBehavior",
    "launchMode",
    "centerOnLaunch",
    "alwaysOnTop",
  ],
  terminal: [
    "terminalFontSize",
    "terminalFontFamily",
    "terminalLineHeight",
    "terminalCursorStyle",
    "terminalCursorBlink",
    "terminalScrollback",
    "terminalCopyOnSelect",
    "terminalRightClickPaste",
    "terminalWebglRenderer",
  ],
  shells: ["defaultShellId", "defaultShellProfile", "customShells"],
  ssh: [
    "sshDefaultUsername",
    "sshDefaultPort",
    "sshDefaultKeepAlive",
    "sshDefaultStrictHostKey",
    "sshDefaultCompression",
    "sshDefaultForwardAgent",
    "sshDefaultAutoReconnect",
    "sshDefaultReconnectIntervalSec",
  ],
  sftp: [
    "sftpConflictPolicy",
    "sftpShowHiddenFiles",
    "sftpShowLocalInSplit",
    "sftpConfirmBeforeTransfer",
    "sftpDoubleClickFileAction",
  ],
  editor: [
    "editorFontSize",
    "editorWordWrap",
    "editorLineNumbers",
    "editorHighlightActiveLine",
    "editorTabSize",
  ],
};

interface SettingsStoreState {
  settings: AppSettingsValues;
  updateSettings: (next: AppSettingsValues) => void;
  patchSettings: (patch: Partial<AppSettingsValues>) => void;
  resetCategorySettings: (category: SettingsCategoryId) => void;
  resetAllSettings: () => void;
  addCustomShell: (profile: ShellProfile, makeDefault?: boolean) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: loadSettings(),
  updateSettings: (next) => {
    const sanitized = sanitizeSettings(next);
    saveSettings(sanitized);
    set({ settings: sanitized });
  },
  patchSettings: (patch) =>
    set((s) => {
      const next = sanitizeSettings({ ...s.settings, ...patch });
      saveSettings(next);
      return { settings: next };
    }),
  resetCategorySettings: (category) =>
    set((s) => {
      const patch: Partial<AppSettingsValues> = {};
      for (const key of CATEGORY_KEYS[category]) {
        if (key === "customShells") {
          patch.customShells = [];
        } else {
          (patch as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
        }
      }
      const next = sanitizeSettings({ ...s.settings, ...patch });
      saveSettings(next);
      return { settings: next };
    }),
  resetAllSettings: () => {
    const next: AppSettingsValues = { ...DEFAULT_SETTINGS, customShells: [] };
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
