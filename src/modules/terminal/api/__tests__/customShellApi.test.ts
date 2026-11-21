import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/shared/i18n/locales/en.json";
import viLocale from "@/shared/i18n/locales/vi.json";
import { formatLocalizedError } from "@/shared/utils/formatError";

const invokeMock = vi.fn();
const openDialogMock = vi.fn();

vi.mock("@/shared/api/tauriClient", () => ({
  Channel: class {},
  invoke: (...args: unknown[]) => invokeMock(...args),
  listenEvent: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

const { sessionApi } = await import("../sessionApi");

function makeTranslator(dict: Record<string, Record<string, string>>) {
  return (key: string, params?: Record<string, string | number>) => {
    const [ns, field] = key.split(".");
    let template = dict[ns]?.[field] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
    }
    return template;
  };
}

describe("Custom shell sessionApi & error localization", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls check_shell_exe IPC command with the provided path", async () => {
    invokeMock.mockResolvedValueOnce("C:\\Windows\\System32\\cmd.exe");
    const resolved = await sessionApi.checkShellExe("cmd");
    expect(invokeMock).toHaveBeenCalledWith("check_shell_exe", { path: "cmd" });
    expect(resolved).toBe("C:\\Windows\\System32\\cmd.exe");

    invokeMock.mockResolvedValueOnce(null);
    const missing = await sessionApi.checkShellExe("C:\\missing\\shell.exe");
    expect(missing).toBeNull();
  });

  it("opens native file picker with Windows executable filters and normalizes return shapes", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    openDialogMock.mockResolvedValueOnce("D:\\Tools\\nu.exe");

    const picked = await sessionApi.pickShellExe("D:\\Tools", {
      executable: "Executable",
      allFiles: "All files",
    });
    expect(picked).toBe("D:\\Tools\\nu.exe");
    expect(openDialogMock).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      defaultPath: "D:\\Tools",
      filters: [
        { name: "Executable", extensions: ["exe", "cmd", "bat", "com", "ps1"] },
        { name: "All files", extensions: ["*"] },
      ],
    });

    // Handles array return value defensively
    openDialogMock.mockResolvedValueOnce(["D:\\Tools\\pwsh.exe"]);
    expect(await sessionApi.pickShellExe()).toBe("D:\\Tools\\pwsh.exe");

    // Handles user cancellation
    openDialogMock.mockResolvedValueOnce(null);
    expect(await sessionApi.pickShellExe()).toBeNull();
  });

  it("omits Windows file filters on non-Windows user agents", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    openDialogMock.mockResolvedValueOnce("/usr/bin/zsh");

    const picked = await sessionApi.pickShellExe(undefined, {
      executable: "Executable",
      allFiles: "All files",
    });
    expect(picked).toBe("/usr/bin/zsh");
    expect(openDialogMock).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      defaultPath: undefined,
      filters: undefined,
    });
  });

  it("localizes custom shell backend validation errors in vi and en while keeping OS errors in English", () => {
    const tVi = makeTranslator(viLocale as Record<string, Record<string, string>>);
    const tEn = makeTranslator(en as Record<string, Record<string, string>>);

    const unauthorizedErr =
      "Validation error: Executable 'D:\\Tools\\nu.exe' is not an authorized interactive shell for elevated execution";
    expect(formatLocalizedError(unauthorizedErr, tVi)).toContain("D:\\Tools\\nu.exe");
    expect(formatLocalizedError(unauthorizedErr, tVi)).not.toContain("Validation error:");
    expect(formatLocalizedError(unauthorizedErr, tEn)).toContain("D:\\Tools\\nu.exe");

    const argDisallowedErr =
      "Validation error: Argument '-Command' is not permitted for elevated PowerShell shell (non-interactive execution blocked)";
    expect(formatLocalizedError(argDisallowedErr, tVi)).toContain("-Command");
    expect(formatLocalizedError(argDisallowedErr, tEn)).toContain("-Command");

    expect(
      formatLocalizedError("Validation error: Elevated shell executable cannot be empty", tVi)
    ).toBe(viLocale.errors.session_shell_exe_empty);

    expect(
      formatLocalizedError("Validation error: Shell profile name and executable cannot be empty", tVi)
    ).toBe(viLocale.errors.shell_profile_empty);

    // Low-level OS/PTY errors must pass through in English
    expect(formatLocalizedError("PTY error: ConPTY: access denied", tVi)).toBe(
      "ConPTY: access denied"
    );
  });
});
