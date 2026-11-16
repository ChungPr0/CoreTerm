import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellProfile } from "@/shared/types/ipc";
import { DEFAULT_LOCAL_SHELL } from "@/modules/workspace";

const invokeMock = vi.fn();

vi.mock("@/shared/api/tauriClient", () => ({
  Channel: class {},
  invoke: (...args: unknown[]) => invokeMock(...args),
  listenEvent: vi.fn(),
}));

const { resolveDefaultShell, useShellsStore } = await import("../useShellsStore");

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

  it("resolves preferred default shell with sensible fallbacks", () => {
    expect(resolveDefaultShell([], "cmd")).toEqual(DEFAULT_LOCAL_SHELL);
    expect(resolveDefaultShell(SAMPLE_SHELLS, "git-bash").id).toBe("git-bash");
    expect(resolveDefaultShell(SAMPLE_SHELLS, "missing").id).toBe("powershell");
    expect(resolveDefaultShell(SAMPLE_SHELLS.slice(1), "missing").id).toBe("cmd");
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
