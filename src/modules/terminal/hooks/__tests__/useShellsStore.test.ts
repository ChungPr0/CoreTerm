import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellProfile } from "@/shared/types/ipc";
import { DEFAULT_LOCAL_SHELL } from "@/modules/workspace";

const invokeMock = vi.fn();

vi.mock("@/shared/api/tauriClient", () => ({
  Channel: class {},
  invoke: (...args: unknown[]) => invokeMock(...args),
  listenEvent: vi.fn(),
}));

const {
  makeCustomShell,
  formatShellArgs,
  shellNameFromPath,
  mergeShells,
  parseShellArgs,
  resolveDefaultShell,
  useShellsStore,
} = await import("../useShellsStore");

const SAMPLE_SHELLS: ShellProfile[] = [
  DEFAULT_LOCAL_SHELL,
  { id: "cmd", kind: "cmd", name: "CMD", executable: "cmd.exe", args: [] },
  {
    id: "git-bash",
    kind: "git-bash",
    name: "Git Bash",
    executable: "C:\\Program Files\\Git\\bin\\bash.exe",
    args: ["--login", "-i"],
  },
  {
    id: "wsl:Ubuntu",
    kind: "wsl",
    name: "WSL: Ubuntu",
    executable: "wsl.exe",
    args: ["-d", "Ubuntu"],
  },
];

describe("useShellsStore", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useShellsStore.setState({ shells: [], isLoaded: false });
  });

  it("resolves preferred default shell with priority fallbacks and returns null when empty", () => {
    expect(resolveDefaultShell([], "cmd")).toBeNull();
    expect(resolveDefaultShell(SAMPLE_SHELLS, "git-bash")?.id).toBe("git-bash");
    expect(resolveDefaultShell(SAMPLE_SHELLS, "missing")?.id).toBe("powershell");
    expect(resolveDefaultShell(SAMPLE_SHELLS.slice(1), "missing")?.id).toBe("cmd");
    expect(resolveDefaultShell([SAMPLE_SHELLS[3]], "powershell")?.id).toBe("wsl:Ubuntu");
  });

  it("merges detected and custom shells without duplicate ids", () => {
    const custom = makeCustomShell({
      id: "custom:nu",
      name: "Nushell",
      executable: "D:\\Tools\\nu.exe",
      args: ["--login"],
    });
    const dup = { ...custom, name: "Duplicate" };
    const merged = mergeShells(SAMPLE_SHELLS.slice(0, 2), [custom, dup]);
    expect(merged.map((s) => s.id)).toEqual(["powershell", "cmd", "custom:nu"]);
    expect(merged[2].kind).toBe("custom");
  });

  it("parses, formats shell args, and infers shell display names", () => {
    const parsed = parseShellArgs('-NoLogo -File "C:\\my scripts\\init.ps1" --login');
    expect(parsed).toEqual(["-NoLogo", "-File", "C:\\my scripts\\init.ps1", "--login"]);
    expect(formatShellArgs(parsed)).toBe('-NoLogo -File "C:\\my scripts\\init.ps1" --login');
    expect(shellNameFromPath("D:\\Portable\\pwsh\\pwsh.exe")).toBe("pwsh");
  });

  it("loads detected shells from detect_available_shells command", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SHELLS);

    const detected = await useShellsStore.getState().detectShells();
    expect(invokeMock).toHaveBeenCalledWith("detect_available_shells", { refresh: false });
    expect(detected).toEqual(SAMPLE_SHELLS);
    expect(useShellsStore.getState().shells).toEqual(SAMPLE_SHELLS);
    expect(useShellsStore.getState().isLoaded).toBe(true);
  });

  it("falls back to default shell if detection fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("ipc unavailable"));

    const detected = await useShellsStore.getState().detectShells();
    expect(detected).toEqual([DEFAULT_LOCAL_SHELL]);
    expect(useShellsStore.getState().shells).toEqual([DEFAULT_LOCAL_SHELL]);
    expect(useShellsStore.getState().isLoaded).toBe(true);
  });
});
