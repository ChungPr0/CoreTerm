import type { FileItem, LocalFsEntryDto, SftpEntryDto } from "../types";

export type SortKey = "name" | "size" | "mtime";
export type SortDir = "asc" | "desc";

export interface DirHistory {
  entries: string[];
  index: number;
}

export const EMPTY_HISTORY: DirHistory = { entries: [], index: -1 };

export const DEFAULT_COLS = { size: 78, mtime: 126, perms: 112 };

export type ColWidths = { name: number; size: number; mtime: number; perms: number };
export type ColEdge = "name-size" | "size-mtime" | "mtime-perms";

export const COL_PAIRS: Record<
  ColEdge,
  { left: keyof ColWidths; right: keyof ColWidths; minLeft: number; minRight: number }
> = {
  "name-size": { left: "name", right: "size", minLeft: 64, minRight: 40 },
  "size-mtime": { left: "size", right: "mtime", minLeft: 40, minRight: 40 },
  "mtime-perms": { left: "mtime", right: "perms", minLeft: 40, minRight: 40 },
};

export function pushDirHistory(prev: DirHistory, path: string): DirHistory {
  if (!path) return prev;
  if (prev.index >= 0 && prev.entries[prev.index] === path) return prev;
  const trimmed = prev.entries.slice(0, prev.index + 1);
  const next = [...trimmed, path];
  return next.length > 50
    ? { entries: next.slice(next.length - 50), index: 49 }
    : { entries: next, index: next.length - 1 };
}

export const toRemoteItem = (e: SftpEntryDto): FileItem => ({
  name: e.name,
  path: e.path,
  isDir: e.kind === "DIR" || (e.kind === "SYMLINK" && e.symlink_target_is_dir),
  isSymlink: e.kind === "SYMLINK",
  size: e.size,
  mtimeMs: e.mtime_ms,
  mode: e.permissions,
  perms: e.permissions_display,
});

export const toLocalItem = (e: LocalFsEntryDto): FileItem => ({
  name: e.name,
  path: e.path,
  isDir: e.kind === "DIR",
  isSymlink: e.kind === "SYMLINK",
  size: e.size,
  mtimeMs: e.mtime_ms,
});

export function fitColumns(raw: ColWidths, total: number): ColWidths {
  const sum = raw.name + raw.size + raw.mtime + raw.perms;
  if (sum <= 0 || total <= 0) return raw;
  const scale = Math.abs(sum - total) < 0.01 ? 1 : total / sum;
  const size = Math.round(raw.size * scale);
  const mtime = Math.round(raw.mtime * scale);
  const perms = raw.perms > 0 ? Math.round(raw.perms * scale) : 0;
  const name = total - size - mtime - perms;
  if (name >= 0) return { name, size, mtime, perms };
  return { name: 0, size: Math.max(0, total - mtime - perms), mtime, perms };
}

export function normalizePath(p: string): string {
  const norm = p.replace(/\\/g, "/");
  return norm === "/" ? "/" : norm.replace(/\/+$/, "");
}

/**
 * Given the current directory displayed in a pane (`cwd`) and the destination path
 * of a transfer (`destPath`), returns the exact item path inside `cwd` that corresponds
 * to this transfer.
 * - If `destPath` is inside a subfolder of `cwd`, returns the path to that direct subfolder.
 * - If `destPath` is directly in `cwd`, returns `destPath` itself (with cwd separator style).
 * - If `destPath` is outside `cwd`, returns null.
 */
export function resolveItemInCwd(cwd: string, destPath: string): string | null {
  if (!cwd || !destPath) return null;
  const normCwd = normalizePath(cwd);
  const normDest = normalizePath(destPath);

  const normCwdLower = normCwd.toLowerCase();
  const normDestLower = normDest.toLowerCase();

  const prefix = normCwdLower === "/" ? "/" : normCwdLower + "/";
  if (normDestLower.startsWith(prefix)) {
    const rel = normDest.slice(prefix.length);
    const topName = rel.split("/")[0];
    if (!topName) return null;
    const sep = cwd.includes("\\") ? "\\" : "/";
    const trimmedCwd = normCwd === "/" ? "" : cwd.replace(/[\\/]+$/, "");
    return `${trimmedCwd}${sep}${topName}`;
  }

  return null;
}

export function sortAndFilterItems(
  items: FileItem[],
  filter: string,
  sortKey: SortKey,
  sortDir: SortDir
): FileItem[] {
  const q = filter.trim().toLowerCase();
  const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : [...items];
  const dir = sortDir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (sortKey === "size") return (a.size - b.size) * dir || a.name.localeCompare(b.name);
    if (sortKey === "mtime") {
      return ((a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)) * dir || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
  });
  return list;
}
