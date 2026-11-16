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
  });
});
