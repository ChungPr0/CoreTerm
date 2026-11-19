import { describe, expect, it } from "vitest";
import type { FileItem } from "../../types";
import {
  EMPTY_HISTORY,
  fitColumns,
  pushDirHistory,
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

  it("fits column widths cleanly to container total", () => {
    const fitted = fitColumns({ name: 200, size: 100, mtime: 100, perms: 0 }, 800);
    expect(fitted.name + fitted.size + fitted.mtime + fitted.perms).toBe(800);
    expect(fitted.perms).toBe(0);
    expect(fitted.name).toBe(400);
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
});
