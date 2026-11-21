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

  it("detects unsaved settings changes accurately via hasSettingsChanges", async () => {
    const { hasSettingsChanges } = await import("../settingsDiff");
    const baseShell = {
      id: "custom:nu",
      kind: "custom",
      name: "Nushell",
      executable: "D:\\Tools\\nu.exe",
      args: ["--login"],
    };
    const saved = {
      launchCols: 100,
      launchRows: 30,
      sftpConflictPolicy: "ASK" as const,
      defaultShellId: "powershell",
      customShells: [baseShell],
    };
    const unchangedDraft = {
      cols: 100,
      rows: 30,
      sftpConflictPolicy: "ASK" as const,
      effectiveDefaultShellId: "powershell",
      initialEffectiveDefaultShellId: "powershell",
      customShells: [{ ...baseShell, args: ["--login"] }],
      contextMenuDraft: false,
      contextMenuOriginal: false,
      hasDirtyShellEditor: false,
    };

    expect(hasSettingsChanges(saved, unchangedDraft)).toBe(false);
    expect(hasSettingsChanges(saved, { ...unchangedDraft, cols: 120 })).toBe(true);
    expect(hasSettingsChanges(saved, { ...unchangedDraft, rows: 40 })).toBe(true);
    expect(
      hasSettingsChanges(saved, { ...unchangedDraft, sftpConflictPolicy: "OVERWRITE" })
    ).toBe(true);
    expect(
      hasSettingsChanges(saved, { ...unchangedDraft, effectiveDefaultShellId: "custom:nu" })
    ).toBe(true);
    expect(
      hasSettingsChanges(saved, { ...unchangedDraft, contextMenuDraft: true })
    ).toBe(true);
    expect(
      hasSettingsChanges(saved, { ...unchangedDraft, hasDirtyShellEditor: true })
    ).toBe(true);
    expect(
      hasSettingsChanges(saved, {
        ...unchangedDraft,
        customShells: [{ ...baseShell, args: ["--login", "-i"] }],
      })
    ).toBe(true);
    expect(
      hasSettingsChanges(saved, { ...unchangedDraft, customShells: [] })
    ).toBe(true);
  });
});
