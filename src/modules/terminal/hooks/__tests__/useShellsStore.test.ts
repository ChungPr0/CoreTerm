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
    const emptyId = { ...custom, id: "" };
    const shadowDetected = { ...SAMPLE_SHELLS[0], name: "Overridden PowerShell" };
    const merged = mergeShells(SAMPLE_SHELLS.slice(0, 2), [custom, dup, emptyId, shadowDetected]);
    expect(merged.map((s) => s.id)).toEqual(["powershell", "cmd", "custom:nu"]);
    expect(merged[0].name).toBe(SAMPLE_SHELLS[0].name);
    expect(merged[2].kind).toBe("custom");
  });

  it("resolves custom shell as default and falls back when removed", () => {
    const custom = makeCustomShell({
      id: "custom:nu",
      name: "Nushell",
      executable: "D:\\Tools\\nu.exe",
    });
    const merged = mergeShells(SAMPLE_SHELLS, [custom]);
    expect(resolveDefaultShell(merged, "custom:nu")?.id).toBe("custom:nu");
    // After deleting the custom shell, fallback follows DEFAULT_SHELL_PRIORITY
    expect(resolveDefaultShell(SAMPLE_SHELLS, "custom:nu")?.id).toBe("powershell");
  });

  it("parses, formats shell args, and infers shell display names", () => {
    const parsed = parseShellArgs('-NoLogo -File "C:\\my scripts\\init.ps1" --login');
    expect(parsed).toEqual(["-NoLogo", "-File", "C:\\my scripts\\init.ps1", "--login"]);
    expect(formatShellArgs(parsed)).toBe('-NoLogo -File "C:\\my scripts\\init.ps1" --login');
    expect(shellNameFromPath("D:\\Portable\\pwsh\\pwsh.exe")).toBe("pwsh");
  });

  it("handles edge cases in parseShellArgs and formatShellArgs", () => {
    expect(parseShellArgs("")).toEqual([]);
    expect(parseShellArgs("   \t  ")).toEqual([]);
    expect(parseShellArgs("  --login   -i  ")).toEqual(["--login", "-i"]);
    expect(parseShellArgs("-c 'echo hello world'")).toEqual(["-c", "echo hello world"]);
    expect(parseShellArgs('-Flag "" --end')).toEqual(["-Flag", "", "--end"]);

    expect(formatShellArgs([])).toBe("");
    expect(formatShellArgs(["-NoLogo", ""])).toBe('-NoLogo ""');
    expect(formatShellArgs(['say "hi"'])).toBe('"say \\"hi\\""');

    const roundTripInput = ["-NoLogo", "C:\\My Folder\\init.ps1", "", "--login"];
    expect(parseShellArgs(formatShellArgs(roundTripInput))).toEqual(roundTripInput);
  });

  it("infers shell names from Windows/POSIX paths and respects fallback", () => {
    expect(shellNameFromPath("C:\\Windows\\System32\\CMD.EXE")).toBe("CMD");
    expect(shellNameFromPath("D:\\scripts\\launch.bat")).toBe("launch");
    expect(shellNameFromPath("D:\\scripts\\run.cmd")).toBe("run");
    expect(shellNameFromPath("D:\\tools\\legacy.com")).toBe("legacy");
    expect(shellNameFromPath("/usr/local/bin/fish")).toBe("fish");
    expect(shellNameFromPath("D:\\scripts\\init.ps1")).toBe("init.ps1");
    expect(shellNameFromPath("   ", "Shell tùy chỉnh")).toBe("Shell tùy chỉnh");
    expect(shellNameFromPath("C:\\folder\\", "Fallback")).toBe("Fallback");
  });

  it("creates custom shell profiles with generated or preserved ids and defaults", () => {
    const created = makeCustomShell({
      name: "  ",
      executable: "  D:\\Tools\\nu.exe  ",
    });
    expect(created.id).toMatch(/^custom:/);
    expect(created.kind).toBe("custom");
    expect(created.name).toBe("nu");
    expect(created.executable).toBe("D:\\Tools\\nu.exe");
    expect(created.args).toEqual([]);

    const edited = makeCustomShell({
      id: "  custom:existing  ",
      name: "  Nushell Work  ",
      executable: "D:\\Tools\\nu.exe",
      args: ["--login"],
    });
    expect(edited.id).toBe("custom:existing");
    expect(edited.name).toBe("Nushell Work");
    expect(edited.args).toEqual(["--login"]);
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
