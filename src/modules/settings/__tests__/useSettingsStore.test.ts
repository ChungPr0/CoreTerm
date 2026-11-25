import { afterEach, describe, expect, it, vi } from "vitest";

describe("useSettingsStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("updates and persists settings in storage", async () => {
    const storeMap = new Map<string, string>();
    const storageMock = {
      getItem: (k: string) => storeMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storeMap.set(k, v);
      },
      removeItem: (k: string) => {
        storeMap.delete(k);
      },
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.stubGlobal("window", { localStorage: storageMock });
    vi.resetModules();

    const { useSettingsStore } = await import("../useSettingsStore");
    const initial = useSettingsStore.getState().settings;
    expect(typeof initial.launchCols).toBe("number");
    expect(typeof initial.launchRows).toBe("number");

    const cmdProfile = {
      id: "cmd",
      kind: "cmd",
      name: "CMD",
      executable: "cmd.exe",
      args: [],
    };
    const updated = {
      ...initial,
      sftpConflictPolicy: "OVERWRITE" as const,
      launchCols: 120,
      defaultShellId: "cmd",
      defaultShellProfile: cmdProfile,
    };
    useSettingsStore.getState().updateSettings(updated);

    expect(useSettingsStore.getState().settings).toEqual(updated);
    expect(Array.from(storeMap.values()).some((v) => v.includes('"launchCols":120'))).toBe(true);
    expect(Array.from(storeMap.values()).some((v) => v.includes('"defaultShellId":"cmd"'))).toBe(true);

    const customShell = {
      id: "custom:nu",
      kind: "custom",
      name: "Nushell",
      executable: "D:\\Tools\\nu.exe",
      args: ["--login"],
    };
    useSettingsStore.getState().addCustomShell(customShell, true);
    expect(useSettingsStore.getState().settings.customShells).toEqual([customShell]);
    expect(useSettingsStore.getState().settings.defaultShellId).toBe("custom:nu");
    expect(useSettingsStore.getState().settings.defaultShellProfile).toEqual(customShell);

    // Upserting existing custom shell updates its details in place
    const updatedCustomShell = {
      ...customShell,
      name: "Nushell 2.0",
      args: ["--login", "--config", "none"],
    };
    useSettingsStore.getState().addCustomShell(updatedCustomShell, false);
    expect(useSettingsStore.getState().settings.customShells).toEqual([updatedCustomShell]);
    expect(useSettingsStore.getState().settings.defaultShellId).toBe("custom:nu");
  });

  it("recovers with default settings when localStorage contains corrupted JSON", async () => {
    const storageMock = {
      getItem: () => "{corrupted-json-data",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.resetModules();

    const { useSettingsStore } = await import("../useSettingsStore");
    const settings = useSettingsStore.getState().settings;
    expect(settings.launchCols).toBeGreaterThan(0);
    expect(settings.launchRows).toBeGreaterThan(0);
    expect(settings.sftpConflictPolicy).toBe("ASK");
    expect(settings.customShells).toEqual([]);
  });

  it("sanitizes out-of-range dimensions and unknown conflict policies from storage", async () => {
    const rawSaved = JSON.stringify({
      launchCols: -50,
      launchRows: 999999,
      sftpConflictPolicy: "INVALID_UNKNOWN_POLICY",
      defaultShellId: "   ",
      customShells: [
        { id: "s1", name: "S1", executable: "s1.exe", args: [] },
        { id: "s1", name: "Duplicate", executable: "s1.exe", args: [] }, // duplicate ID
        { id: "invalid", name: "NoExe", args: "not-an-array" }, // malformed
      ],
    });

    const storageMock = {
      getItem: () => rawSaved,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.resetModules();

    const { useSettingsStore } = await import("../useSettingsStore");
    const settings = useSettingsStore.getState().settings;

    // Must be clamped to reasonable bounds
    expect(settings.launchCols).toBeGreaterThanOrEqual(40);
    expect(settings.launchRows).toBeLessThanOrEqual(50);
    expect(settings.sftpConflictPolicy).toBe("ASK");
    // Duplicates and malformed shells filtered out
    expect(settings.customShells).toHaveLength(1);
    expect(settings.customShells[0].id).toBe("s1");
    expect(settings.customShells[0].kind).toBe("custom");
  });

  it("manages custom shell addition without changing default and supports deletion", async () => {
    const storeMap = new Map<string, string>();
    const storageMock = {
      getItem: (k: string) => storeMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storeMap.set(k, v);
      },
      removeItem: (k: string) => {
        storeMap.delete(k);
      },
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.resetModules();

    const { useSettingsStore } = await import("../useSettingsStore");
    const initialDefaultId = useSettingsStore.getState().settings.defaultShellId;

    const firstCustom = {
      id: "custom:bash",
      kind: "custom",
      name: "Portable Bash",
      executable: "D:\\Portable\\bash.exe",
      args: ["--login"],
    };
    useSettingsStore.getState().addCustomShell(firstCustom, false);
    expect(useSettingsStore.getState().settings.customShells).toEqual([firstCustom]);
    expect(useSettingsStore.getState().settings.defaultShellId).toBe(initialDefaultId);

    const secondCustom = {
      id: "custom:fish",
      kind: "custom",
      name: "Fish",
      executable: "D:\\Portable\\fish.exe",
      args: [],
    };
    useSettingsStore.getState().addCustomShell(secondCustom, true);
    expect(useSettingsStore.getState().settings.customShells).toEqual([firstCustom, secondCustom]);
    expect(useSettingsStore.getState().settings.defaultShellId).toBe("custom:fish");
    expect(useSettingsStore.getState().settings.defaultShellProfile).toEqual(secondCustom);

    // Deleting a custom shell via updateSettings persists the remaining list
    const current = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateSettings({
      ...current,
      customShells: current.customShells.filter((s) => s.id !== "custom:fish"),
      defaultShellId: "powershell",
      defaultShellProfile: undefined,
    });
    expect(useSettingsStore.getState().settings.customShells).toEqual([firstCustom]);
    const persisted = JSON.parse(storeMap.get("coreterm_settings") ?? "{}");
    expect(persisted.customShells).toEqual([firstCustom]);
  });

  it("filters out malformed customShells entries and non-array values on load", async () => {
    const rawSaved = JSON.stringify({
      customShells: [
        { id: "  ", name: "Blank Id", executable: "a.exe", args: [] },
        { id: "c1", name: "   ", executable: "a.exe", args: [] },
        { id: "c2", name: "Blank Exe", executable: "  ", args: [] },
        { id: "c3", name: "Bad Args Element", executable: "a.exe", args: ["--ok", 123] },
        { id: "c4", name: "Valid Shell", executable: "D:\\ok.exe", args: ["-NoLogo"] },
      ],
    });
    const storageMock = {
      getItem: () => rawSaved,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal("localStorage", storageMock);
    vi.resetModules();

    const { useSettingsStore } = await import("../useSettingsStore");
    expect(useSettingsStore.getState().settings.customShells).toEqual([
      {
        id: "c4",
        kind: "custom",
        name: "Valid Shell",
        executable: "D:\\ok.exe",
        args: ["-NoLogo"],
      },
    ]);
  });

  it("hydrates legacy partial settings, clamps bounds, and supports patch & category/global resets", async () => {
    const storeMap = new Map<string, string>();
    const storageMock = {
      getItem: (k: string) => storeMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storeMap.set(k, v);
      },
      removeItem: (k: string) => {
        storeMap.delete(k);
      },
    };
    // Simulate legacy v0.5.3 JSON without new Terminal/SSH/SFTP/Editor fields
    storeMap.set(
      "coreterm_settings",
      JSON.stringify({
        launchCols: 110,
        launchRows: 32,
        sftpConflictPolicy: "SKIP",
        defaultShellId: "cmd",
      })
    );
    vi.stubGlobal("localStorage", storageMock);
    vi.resetModules();

    const { useSettingsStore } = await import("../useSettingsStore");
    const { DEFAULT_SETTINGS, sanitizeSettings } = await import("../settingsStorage");
    const hydrated = useSettingsStore.getState().settings;
    expect(hydrated.launchCols).toBe(110);
    expect(hydrated.launchRows).toBe(32);
    expect(hydrated.sftpConflictPolicy).toBe("SKIP");
    expect(hydrated.defaultShellId).toBe("cmd");
    expect(hydrated.terminalFontSize).toBe(DEFAULT_SETTINGS.terminalFontSize);
    expect(hydrated.sshDefaultPort).toBe(22);
    expect(hydrated.sftpShowHiddenFiles).toBe(true);
    expect(hydrated.editorTabSize).toBe(2);

    // Sanitizes invalid bounds across all new categories
    const clamped = sanitizeSettings({
      terminalFontFamily: "Arbitrary Custom Font",
      terminalFontSize: 99,
      terminalLineHeight: 0.2,
      terminalCursorStyle: "unknown",
      terminalScrollback: 999999,
      sshDefaultUsername: "-baduser",
      sshDefaultPort: 90000,
      sshDefaultKeepAlive: -5,
      sshDefaultReconnectIntervalSec: 500,
      editorFontSize: 3,
      editorTabSize: 7,
      closeLastTabBehavior: "bad",
      defaultImeMode: "unknown",
      startupBehavior: "unknown",
      newInstanceBehavior: "unknown",
      launchMode: "unknown",
      centerOnLaunch: "yes",
      alwaysOnTop: 123,
      useActiveTabTitle: "invalid",
      showAdminShield: 99,
      newTabPosition: "middle",
      tabWidthMode: "huge",
      showTabsInFullscreen: "no",
      keybindings: { closeTab: "ctrl+w", newTab: "invalid_bare_key" },
      terminalTrimPasteWhitespace: "invalid",
      terminalCtrlScrollZoom: 0,
      terminalDetectUrls: null,
      warnCloseMultiTabs: "no",
      warnPasteLarge: 42,
      warnPasteMultiline: "invalid_mode",
      sftpDoubleClickFileAction: "bad",
    });
    expect(clamped.terminalFontFamily).toBe(DEFAULT_SETTINGS.terminalFontFamily);
    expect(clamped.terminalFontSize).toBe(24);
    expect(clamped.terminalLineHeight).toBe(1.0);
    expect(clamped.terminalCursorStyle).toBe("block");
    expect(clamped.terminalScrollback).toBe(50000);
    expect(clamped.sshDefaultUsername).toBe("root");
    expect(clamped.sshDefaultPort).toBe(65535);
    expect(clamped.sshDefaultKeepAlive).toBe(60);
    expect(clamped.sshDefaultReconnectIntervalSec).toBe(60);
    expect(clamped.editorFontSize).toBe(10);
    expect(clamped.editorTabSize).toBe(2);
    expect(clamped.closeLastTabBehavior).toBe("exit");
    expect(clamped.defaultImeMode).toBe("default");
    expect(clamped.startupBehavior).toBe("default_profile");
    expect(clamped.newInstanceBehavior).toBe("attach");
    expect(clamped.launchMode).toBe("default");
    expect(clamped.centerOnLaunch).toBe(false);
    expect(clamped.alwaysOnTop).toBe(false);
    expect(clamped.useActiveTabTitle).toBe(true);
    expect(clamped.showAdminShield).toBe(true);
    expect(clamped.newTabPosition).toBe("end");
    expect(clamped.tabWidthMode).toBe("equal");
    expect(clamped.showTabsInFullscreen).toBe(true);
    expect(clamped.keybindings).toEqual({ closeTab: "Ctrl+W" });
    expect(clamped.terminalTrimPasteWhitespace).toBe(true);
    expect(clamped.terminalCtrlScrollZoom).toBe(true);
    expect(clamped.terminalDetectUrls).toBe(true);
    expect(clamped.warnCloseMultiTabs).toBe(true);
    expect(clamped.warnPasteLarge).toBe(true);
    expect(clamped.warnPasteMultiline).toBe("bracketed_disabled");
    expect(clamped.sftpDoubleClickFileAction).toBe("edit");

    // patchSettings persists incremental updates immediately
    useSettingsStore.getState().patchSettings({
      closeLastTabBehavior: "new_local",
      launchCols: 140,
      defaultImeMode: "alphanumeric",
      startupBehavior: "restore_session",
      newInstanceBehavior: "new_window",
      launchMode: "maximized",
      centerOnLaunch: true,
      alwaysOnTop: true,
      useActiveTabTitle: false,
      showAdminShield: false,
      newTabPosition: "after_current",
      tabWidthMode: "compact",
      showTabsInFullscreen: false,
      keybindings: { closeTab: "Ctrl+W" },
      terminalFontSize: 18,
      terminalCopyOnSelect: true,
      terminalRightClickPaste: true,
      terminalTrimPasteWhitespace: false,
      terminalCtrlScrollZoom: false,
      terminalDetectUrls: false,
      warnCloseMultiTabs: false,
      warnPasteLarge: false,
      warnPasteMultiline: "always",
      sshDefaultPort: 2222,
      sftpShowHiddenFiles: false,
      editorTabSize: 4,
    });
    expect(useSettingsStore.getState().settings.closeLastTabBehavior).toBe("new_local");
    expect(useSettingsStore.getState().settings.defaultImeMode).toBe("alphanumeric");
    expect(useSettingsStore.getState().settings.startupBehavior).toBe("restore_session");
    expect(useSettingsStore.getState().settings.newInstanceBehavior).toBe("new_window");
    expect(useSettingsStore.getState().settings.launchMode).toBe("maximized");
    expect(useSettingsStore.getState().settings.centerOnLaunch).toBe(true);
    expect(useSettingsStore.getState().settings.alwaysOnTop).toBe(true);
    expect(useSettingsStore.getState().settings.terminalFontSize).toBe(18);
    expect(useSettingsStore.getState().settings.terminalCopyOnSelect).toBe(true);
    expect(useSettingsStore.getState().settings.terminalRightClickPaste).toBe(true);
    expect(useSettingsStore.getState().settings.terminalTrimPasteWhitespace).toBe(false);
    expect(useSettingsStore.getState().settings.terminalCtrlScrollZoom).toBe(false);
    expect(useSettingsStore.getState().settings.terminalDetectUrls).toBe(false);
    expect(useSettingsStore.getState().settings.warnCloseMultiTabs).toBe(false);
    expect(useSettingsStore.getState().settings.warnPasteLarge).toBe(false);
    expect(useSettingsStore.getState().settings.warnPasteMultiline).toBe("always");
    expect(useSettingsStore.getState().settings.sshDefaultPort).toBe(2222);

    // resetCategorySettings resets only the target section
    useSettingsStore.getState().resetCategorySettings("general");
    expect(useSettingsStore.getState().settings.closeLastTabBehavior).toBe("exit");
    expect(useSettingsStore.getState().settings.launchCols).toBe(140);
    expect(useSettingsStore.getState().settings.defaultImeMode).toBe("alphanumeric");

    useSettingsStore.getState().resetCategorySettings("startup");
    expect(useSettingsStore.getState().settings.launchCols).toBe(DEFAULT_SETTINGS.launchCols);
    expect(useSettingsStore.getState().settings.defaultImeMode).toBe("default");
    expect(useSettingsStore.getState().settings.startupBehavior).toBe("default_profile");
    expect(useSettingsStore.getState().settings.newInstanceBehavior).toBe("attach");
    expect(useSettingsStore.getState().settings.launchMode).toBe("default");
    expect(useSettingsStore.getState().settings.centerOnLaunch).toBe(false);
    // alwaysOnTop now belongs to appearance, so resetting startup leaves it untouched
    expect(useSettingsStore.getState().settings.alwaysOnTop).toBe(true);
    expect(useSettingsStore.getState().settings.terminalFontSize).toBe(18);

    useSettingsStore.getState().resetCategorySettings("appearance");
    expect(useSettingsStore.getState().settings.alwaysOnTop).toBe(false);
    expect(useSettingsStore.getState().settings.useActiveTabTitle).toBe(true);
    expect(useSettingsStore.getState().settings.showAdminShield).toBe(true);
    expect(useSettingsStore.getState().settings.newTabPosition).toBe("end");
    expect(useSettingsStore.getState().settings.tabWidthMode).toBe("equal");
    expect(useSettingsStore.getState().settings.showTabsInFullscreen).toBe(true);

    useSettingsStore.getState().resetCategorySettings("actions");
    expect(useSettingsStore.getState().settings.keybindings).toEqual({});

    useSettingsStore.getState().resetCategorySettings("terminal");
    expect(useSettingsStore.getState().settings.terminalFontSize).toBe(
      DEFAULT_SETTINGS.terminalFontSize
    );
    expect(useSettingsStore.getState().settings.terminalCopyOnSelect).toBe(true);

    useSettingsStore.getState().resetCategorySettings("interaction");
    expect(useSettingsStore.getState().settings.terminalCopyOnSelect).toBe(false);
    expect(useSettingsStore.getState().settings.terminalRightClickPaste).toBe(false);
    expect(useSettingsStore.getState().settings.terminalTrimPasteWhitespace).toBe(true);
    expect(useSettingsStore.getState().settings.terminalCtrlScrollZoom).toBe(true);
    expect(useSettingsStore.getState().settings.terminalDetectUrls).toBe(true);
    expect(useSettingsStore.getState().settings.warnCloseMultiTabs).toBe(true);
    expect(useSettingsStore.getState().settings.warnPasteLarge).toBe(true);
    expect(useSettingsStore.getState().settings.warnPasteMultiline).toBe("bracketed_disabled");
    expect(useSettingsStore.getState().settings.sshDefaultPort).toBe(2222);
    expect(useSettingsStore.getState().settings.sftpShowHiddenFiles).toBe(false);

    // resetAllSettings restores factory defaults
    useSettingsStore.getState().resetAllSettings();
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});
