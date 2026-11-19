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
  });
});
