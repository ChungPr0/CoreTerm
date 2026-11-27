import { describe, expect, it } from "vitest";
import type { FileItem } from "../../types";
import {
  computeDefaultCols,
  EMPTY_HISTORY,
  fitColumns,
  MIN_COLS,
  normalizePath,
  pushDirHistory,
  resolveItemInCwd,
  sortAndFilterItems,
} from "../fileListUtils";

const item = (overrides: Partial<FileItem>): FileItem => ({
  name: "file.txt",
  path: "/file.txt",
  isDir: false,
  isSymlink: false,
  size: 100,
  mtimeMs: 1000,
  ...overrides,
});

describe("fileListUtils", () => {
  it("records history, dedupes repeats, drops forward tail and caps at 50", () => {
    let h = pushDirHistory(EMPTY_HISTORY, "/a");
    h = pushDirHistory(h, "/a");
    h = pushDirHistory(h, "/b");
    expect(h).toEqual({ entries: ["/a", "/b"], index: 1 });

    // Simulate navigating back then opening a new branch
    h = pushDirHistory({ ...h, index: 0 }, "/c");
    expect(h).toEqual({ entries: ["/a", "/c"], index: 1 });

    for (let i = 0; i < 60; i += 1) {
      h = pushDirHistory(h, `/p/${i}`);
    }
    expect(h.entries).toHaveLength(50);
    expect(h.index).toBe(49);
    expect(h.entries[49]).toBe("/p/59");
  });

  it("sorts directories before files and filters by query", () => {
    const list = [
      item({ name: "zeta.log", path: "/zeta.log", size: 500 }),
      item({ name: "alpha-dir", path: "/alpha-dir", isDir: true, size: 0 }),
      item({ name: "beta.txt", path: "/beta.txt", size: 50 }),
    ];

    expect(sortAndFilterItems(list, "", "name", "desc").map((i) => i.name)).toEqual([
      "alpha-dir",
      "zeta.log",
      "beta.txt",
    ]);
    expect(sortAndFilterItems(list, "", "size", "asc").map((i) => i.name)).toEqual([
      "alpha-dir",
      "beta.txt",
      "zeta.log",
    ]);
    expect(sortAndFilterItems(list, "ETA", "name", "asc").map((i) => i.name)).toEqual([
      "beta.txt",
      "zeta.log",
    ]);
  });

  it("hides dotfiles when showHiddenFiles is false", () => {
    const list = [
      item({ name: ".env", path: "/.env" }),
      item({ name: ".ssh", path: "/.ssh", isDir: true }),
      item({ name: "notes.md", path: "/notes.md" }),
    ];

    expect(sortAndFilterItems(list, "", "name", "asc", true).map((i) => i.name)).toEqual([
      ".ssh",
      ".env",
      "notes.md",
    ]);
    expect(sortAndFilterItems(list, "", "name", "asc", false).map((i) => i.name)).toEqual([
      "notes.md",
    ]);
  });

  it("fits column widths cleanly to container total", () => {
    const fitted = fitColumns({ name: 200, size: 100, mtime: 100, perms: 0 }, 800);
    expect(fitted.name + fitted.size + fitted.mtime + fitted.perms).toBe(800);
    expect(fitted.perms).toBe(0);
    expect(fitted.name).toBe(400);
  });

  it("preserves minimum header widths so Vietnamese labels (e.g. KÍCH THƯỚC) are not clipped", () => {
    const localCols = computeDefaultCols(420, false);
    expect(localCols.name + localCols.size + localCols.mtime + localCols.perms).toBe(420);
    expect(localCols.name).toBeGreaterThanOrEqual(MIN_COLS.name);
    expect(localCols.size).toBeGreaterThanOrEqual(MIN_COLS.size);
    expect(localCols.mtime).toBeGreaterThanOrEqual(MIN_COLS.mtime);
    expect(localCols.perms).toBe(0);

    const remoteCols = computeDefaultCols(420, true);
    expect(remoteCols.name + remoteCols.size + remoteCols.mtime + remoteCols.perms).toBe(420);
    expect(remoteCols.name).toBeGreaterThanOrEqual(MIN_COLS.name);
    expect(remoteCols.size).toBeGreaterThanOrEqual(MIN_COLS.size);
    expect(remoteCols.mtime).toBeGreaterThanOrEqual(MIN_COLS.mtime);
    expect(remoteCols.perms).toBeGreaterThanOrEqual(MIN_COLS.perms);

    // Guards against NaN / Infinity container widths
    const raw = { name: 200, size: 116, mtime: 132, perms: 0 };
    expect(fitColumns(raw, Number.NaN)).toEqual(raw);
    expect(fitColumns(raw, Number.POSITIVE_INFINITY)).toEqual(raw);
  });

  it("handles empty lists, special query characters and mtime sorting", () => {
    // Empty list
    expect(sortAndFilterItems([], "test", "name", "asc")).toEqual([]);

    const items = [
      item({ name: "old.log", mtimeMs: 1000 }),
      item({ name: "new.log", mtimeMs: 5000 }),
      item({ name: "mid.log", mtimeMs: 3000 }),
    ];

    expect(sortAndFilterItems(items, "", "mtime", "asc").map((i) => i.name)).toEqual([
      "old.log",
      "mid.log",
      "new.log",
    ]);

    expect(sortAndFilterItems(items, "", "mtime", "desc").map((i) => i.name)).toEqual([
      "new.log",
      "mid.log",
      "old.log",
    ]);

    // Query containing regex special characters like brackets and question marks
    const specialList = [
      item({ name: "app[1].log" }),
      item({ name: "app(prod).log" }),
      item({ name: "other.log" }),
    ];
    expect(sortAndFilterItems(specialList, "[1]", "name", "asc").map((i) => i.name)).toEqual([
      "app[1].log",
    ]);
    expect(sortAndFilterItems(specialList, "(prod)", "name", "asc").map((i) => i.name)).toEqual([
      "app(prod).log",
    ]);
  });

  describe("normalizePath", () => {
    it("normalizes backslashes and trailing slashes", () => {
      expect(normalizePath("D:\\folder\\sub\\")).toBe("D:/folder/sub");
      expect(normalizePath("/remote/path/")).toBe("/remote/path");
      expect(normalizePath("/")).toBe("/");
    });
  });

  describe("resolveItemInCwd", () => {
    it("returns subfolder path when dest is inside a subfolder", () => {
      expect(resolveItemInCwd("/remote", "/remote/my_folder/test.txt")).toBe("/remote/my_folder");
      expect(resolveItemInCwd("/remote/", "/remote/my_folder/sub/test.txt")).toBe("/remote/my_folder");
      expect(resolveItemInCwd("D:\\Downloads", "D:\\Downloads\\my_folder\\test.txt")).toBe(
        "D:\\Downloads\\my_folder"
      );
    });

    it("returns direct item path when dest is in cwd", () => {
      expect(resolveItemInCwd("/remote", "/remote/test.txt")).toBe("/remote/test.txt");
      expect(resolveItemInCwd("D:\\Downloads", "D:\\Downloads\\test.txt")).toBe(
        "D:\\Downloads\\test.txt"
      );
    });

    it("handles linux root cwd", () => {
      expect(resolveItemInCwd("/", "/etc/nginx/nginx.conf")).toBe("/etc");
      expect(resolveItemInCwd("/", "/root.txt")).toBe("/root.txt");
    });

    it("returns null when dest is outside cwd or identical to cwd", () => {
      expect(resolveItemInCwd("/remote", "/other/path/test.txt")).toBeNull();
      expect(resolveItemInCwd("/remote", "/remote")).toBeNull();
      expect(resolveItemInCwd("", "/remote/test.txt")).toBeNull();
    });
  });
});
