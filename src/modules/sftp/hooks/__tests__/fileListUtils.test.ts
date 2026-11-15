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
});
