import { describe, expect, it } from "vitest";
import { fmtMode, fmtSize, fmtSpeed } from "@/shared/utils/formatters";
import {
  joinRemote,
  localParent,
  normPosix,
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
    expect(splitLocalCrumbs("C:\\Users\\dev")).toEqual([
      { label: "C:\\", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "dev", path: "C:\\Users\\dev" },
    ]);
  });

  it("quotes posix cd command safely", () => {
    expect(posixCdCmd("/var/my 'dir'/")).toBe("cd -- '/var/my '\\''dir'\\'''\r");
  });
});
