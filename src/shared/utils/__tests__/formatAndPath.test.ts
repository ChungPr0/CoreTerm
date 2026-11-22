import { describe, expect, it } from "vitest";
import { fmtMode, fmtSize, fmtSpeed } from "@/shared/utils/formatters";
import {
  joinRemote,
  localParent,
  normalizeEditorPathKey,
  normPosix,
  pathBaseName,
  posixCdCmd,
  posixParent,
  splitLocalCrumbs,
  splitRemoteCrumbs,
} from "@/shared/utils/path";

describe("formatters & path utils", () => {
  it("formats sizes, speeds and octal modes", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(1024)).toBe("1.0 KB");
    expect(fmtSize(-5)).toBe("-");
    expect(fmtSpeed(2048)).toBe("2.0 KB/s");
    expect(fmtSpeed(0)).toBe("");
    expect(fmtMode(0o100755)).toBe("0755");
  });

  it("normalizes and joins posix paths", () => {
    expect(normPosix("//var///log/")).toBe("/var/log");
    expect(normPosix("/")).toBe("/");
    expect(normPosix("")).toBe("");
    expect(posixParent("/var/log")).toBe("/var");
    expect(posixParent("/var")).toBe("/");
    expect(joinRemote("/", "etc")).toBe("/etc");
    expect(joinRemote("/home/app/", ".env")).toBe("/home/app/.env");
  });

  it("resolves local parent paths on Windows and POSIX", () => {
    expect(localParent("C:\\")).toBe("C:\\");
    expect(localParent("C:\\Users\\demo")).toBe("C:\\Users");
    expect(localParent("C:\\Users")).toBe("C:\\");
    expect(localParent("/var/log")).toBe("/var");
  });

  it("splits remote and local breadcrumbs", () => {
    expect(splitRemoteCrumbs("/var/log")).toEqual([
      { label: "/", path: "/" },
      { label: "var", path: "/var" },
      { label: "log", path: "/var/log" },
    ]);
    expect(splitRemoteCrumbs("")).toEqual([]);
    expect(splitRemoteCrumbs("   ")).toEqual([]);
    expect(splitLocalCrumbs("")).toEqual([]);
    expect(splitLocalCrumbs("C:\\Users\\dev")).toEqual([
      { label: "C:\\", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "dev", path: "C:\\Users\\dev" },
    ]);
  });

  it("handles Windows OpenSSH SFTP drive paths without leading slash crumbs", () => {
    expect(normPosix("/C:/Users/tienc/")).toBe("/C:/Users/tienc");
    expect(normPosix("/C:")).toBe("/C:/");
    expect(normPosix("C:\\Users\\tienc")).toBe("/C:/Users/tienc");
    expect(joinRemote("/C:/", "Users")).toBe("/C:/Users");
    expect(posixParent("/C:/Users/tienc")).toBe("/C:/Users");
    expect(posixParent("/C:/Users")).toBe("/C:/");
    expect(posixParent("/C:/")).toBe("/C:/");
    expect(splitRemoteCrumbs("/C:/Users/tienc")).toEqual([
      { label: "C:\\", path: "/C:/" },
      { label: "Users", path: "/C:/Users" },
      { label: "tienc", path: "/C:/Users/tienc" },
    ]);
    expect(posixCdCmd("/C:/Users/tienc")).toBe('cd "C:\\Users\\tienc"\r');
  });

  it("quotes posix cd command safely and blocks command substitution / control chars", () => {
    expect(posixCdCmd("/var/my 'dir'/")).toBe("cd -- '/var/my '\\''dir'\\'''\r");
    expect(posixCdCmd("/C:/tmp/$(id)")).toBe("cd 'C:\\tmp\\$(id)'\r");
    expect(posixCdCmd("/C:/tmp/`calc`")).toBe("cd 'C:\\tmp\\`calc`'\r");
    expect(posixCdCmd("/var/log/test\nrm -rf /")).toBe("cd -- '/var/log/testrm -rf '\r");
  });

  it("normalizes editor path keys and extracts path basenames", () => {
    expect(pathBaseName("C:\\Users\\dev\\config.json")).toBe("config.json");
    expect(pathBaseName("/etc/nginx/nginx.conf")).toBe("nginx.conf");
    expect(normalizeEditorPathKey("local", "C:\\Users\\Dev\\App.tsx")).toBe(
      normalizeEditorPathKey("local", "c:/users/dev/app.tsx")
    );
    expect(normalizeEditorPathKey("remote", "//etc/nginx//nginx.conf")).toBe(
      "/etc/nginx/nginx.conf"
    );
  });

  it("handles edge cases in formatters", () => {
    expect(fmtSize(-100)).toBe("-");
    expect(fmtSize(Number.NaN)).toBe("-");
    expect(fmtSize(500)).toBe("500 B");
    expect(fmtSize(1024 * 1024)).toBe("1.0 MB");
    expect(fmtSize(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(fmtSize(1024 * 1024 * 1024 * 1024)).toBe("1.0 TB");

    expect(fmtSpeed(-50)).toBe("");
    expect(fmtSpeed(1024 * 1024 * 5)).toBe("5.0 MB/s");

    expect(fmtMode(0o644)).toBe("0644");
    expect(fmtMode(0o700)).toBe("0700");
    expect(fmtMode(0o777)).toBe("0777");
    expect(fmtMode(0)).toBe("0000");
  });

  it("handles boundary edge cases in posix and local path navigation", () => {
    // Empty & whitespace inputs
    expect(normPosix("   ")).toBe("");
    expect(posixParent("")).toBe("/");
    expect(posixParent("   ")).toBe("/");
    expect(localParent("")).toBe("/");
    expect(localParent("   ")).toBe("/");

    // Deep posix parents
    expect(posixParent("/a/b/c/d")).toBe("/a/b/c");
    expect(posixParent("/a")).toBe("/");
    expect(posixParent("/")).toBe("/");

    // Mixed Windows drive local parent resolution
    expect(localParent("D:")).toBe("D:\\");
    expect(localParent("D:/")).toBe("D:\\");
    expect(localParent("D:\\")).toBe("D:\\");
    expect(localParent("D:\\Project\\app")).toBe("D:\\Project");
    expect(localParent("D:\\Project")).toBe("D:\\");

    // Empty joinRemote
    expect(joinRemote("", "file.txt")).toBe("file.txt");
    expect(joinRemote("/var/www", "sub/file.txt")).toBe("/var/www/sub/file.txt");
  });
});
