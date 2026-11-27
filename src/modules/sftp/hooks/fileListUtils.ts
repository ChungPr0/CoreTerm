import {
  SFTP_COL_DEFAULT_WIDTHS,
  SFTP_COL_MIN_WIDTHS,
  SFTP_COL_NAME_MIN_RATIO,
  SFTP_HISTORY_MAX_ENTRIES,
} from "@/shared/defaults";
import type { FileItem, LocalFsEntryDto, SftpEntryDto } from "../types";

export type SortKey = "name" | "size" | "mtime";
export type SortDir = "asc" | "desc";

export interface DirHistory {
  entries: string[];
  index: number;
}

export const EMPTY_HISTORY: DirHistory = { entries: [], index: -1 };

export const MIN_COLS = SFTP_COL_MIN_WIDTHS;

export const DEFAULT_COLS = SFTP_COL_DEFAULT_WIDTHS;

export type ColWidths = { name: number; size: number; mtime: number; perms: number };
export type ColEdge = "name-size" | "size-mtime" | "mtime-perms";

export const COL_PAIRS: Record<
  ColEdge,
  { left: keyof ColWidths; right: keyof ColWidths; minLeft: number; minRight: number }
> = {
  "name-size": { left: "name", right: "size", minLeft: MIN_COLS.name, minRight: MIN_COLS.size },
  "size-mtime": { left: "size", right: "mtime", minLeft: MIN_COLS.size, minRight: MIN_COLS.mtime },
  "mtime-perms": { left: "mtime", right: "perms", minLeft: MIN_COLS.mtime, minRight: MIN_COLS.perms },
};

export function pushDirHistory(prev: DirHistory, path: string): DirHistory {
  if (!path) return prev;
  if (prev.index >= 0 && prev.entries[prev.index] === path) return prev;
  const trimmed = prev.entries.slice(0, prev.index + 1);
  const next = [...trimmed, path];
  return next.length > SFTP_HISTORY_MAX_ENTRIES
    ? {
        entries: next.slice(next.length - SFTP_HISTORY_MAX_ENTRIES),
        index: SFTP_HISTORY_MAX_ENTRIES - 1,
      }
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
  if (!Number.isFinite(sum) || !Number.isFinite(total) || sum <= 0 || total <= 0) {
    return raw;
  }

  const hasPerms = raw.perms > 0;
  const keys: Array<keyof ColWidths> = hasPerms
    ? ["name", "size", "mtime", "perms"]
    : ["name", "size", "mtime"];
  const minSum =
    MIN_COLS.name + MIN_COLS.size + MIN_COLS.mtime + (hasPerms ? MIN_COLS.perms : 0);

  const vals: ColWidths = {
    name: (raw.name / sum) * total,
    size: (raw.size / sum) * total,
    mtime: (raw.mtime / sum) * total,
    perms: hasPerms ? (raw.perms / sum) * total : 0,
  };

  if (total >= minSum) {
    const locked = new Set<keyof ColWidths>();
    let guard = 0;
    while (guard++ < keys.length) {
      let deficit = 0;
      let slackTotal = 0;
      for (const k of keys) {
        if (locked.has(k)) continue;
        if (vals[k] < MIN_COLS[k]) {
          deficit += MIN_COLS[k] - vals[k];
          vals[k] = MIN_COLS[k];
          locked.add(k);
        } else {
          slackTotal += vals[k] - MIN_COLS[k];
        }
      }
      if (deficit <= 0 || slackTotal <= 0) break;
      for (const k of keys) {
        if (locked.has(k)) continue;
        const slack = vals[k] - MIN_COLS[k];
        vals[k] -= deficit * (slack / slackTotal);
      }
    }
  }

  const size = Math.round(vals.size);
  const mtime = Math.round(vals.mtime);
  const perms = hasPerms ? Math.round(vals.perms) : 0;
  const name = total - size - mtime - perms;
  if (name >= 0) return { name, size, mtime, perms };
  return { name: 0, size: Math.max(0, total - mtime - perms), mtime, perms };
}

export function computeDefaultCols(wrapWidth: number, showPerms: boolean): ColWidths {
  const size = DEFAULT_COLS.size;
  const mtime = DEFAULT_COLS.mtime;
  const perms = showPerms ? DEFAULT_COLS.perms : 0;
  const rightSum = size + mtime + perms;
  const desiredName = Math.max(MIN_COLS.name, Math.round(wrapWidth * SFTP_COL_NAME_MIN_RATIO));
  const name = Math.max(desiredName, wrapWidth - rightSum);
  return fitColumns({ name, size, mtime, perms }, wrapWidth);
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
  sortDir: SortDir,
  showHiddenFiles = true
): FileItem[] {
  const q = filter.trim().toLowerCase();
  const base = showHiddenFiles ? items : items.filter((i) => !i.name.startsWith("."));
  const list = q ? base.filter((i) => i.name.toLowerCase().includes(q)) : [...base];
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
