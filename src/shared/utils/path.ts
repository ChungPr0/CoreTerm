function parseWinSftpPath(raw: string): { drive: string; rest: string[] } | null {
  const m = raw.trim().match(/^\/?([a-zA-Z]:)(?:$|([\\/].*)$)/);
  if (!m) return null;
  const drive = m[1];
  const rest = (m[2] ?? "").split(/[\\/]+/).filter(Boolean);
  return { drive, rest };
}

export function normPosix(raw: string): string {
  const win = parseWinSftpPath(raw);
  if (win) {
    return win.rest.length === 0 ? `/${win.drive}/` : `/${win.drive}/${win.rest.join("/")}`;
  }
  const s = raw.trim().replace(/\/+/g, "/");
  if (!s || s === "/") return "/";
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

export function posixParent(raw: string): string {
  const win = parseWinSftpPath(raw);
  if (win) {
    if (win.rest.length <= 1) return `/${win.drive}/`;
    return `/${win.drive}/${win.rest.slice(0, -1).join("/")}`;
  }
  const path = normPosix(raw);
  if (path === "/") return "/";
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

export function localParent(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-zA-Z]:[\\/]?$/.test(trimmed)) return `${trimmed.slice(0, 2)}\\`;
  const clean = trimmed.replace(/[\\/]+$/, "");
  if (!clean) return "/";
  const sepIdx = Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/"));
  if (sepIdx < 0) return trimmed;
  if (sepIdx === 0) return "/";
  const parent = clean.slice(0, sepIdx);
  return /^[a-zA-Z]:$/.test(parent) ? `${parent}\\` : parent;
}

export function joinRemote(dir: string, name: string): string {
  const base = normPosix(dir);
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}

export interface PathCrumb {
  label: string;
  path: string;
}

export function splitRemoteCrumbs(raw: string): PathCrumb[] {
  const win = parseWinSftpPath(raw);
  if (win) {
    const rootPath = `/${win.drive}/`;
    const crumbs: PathCrumb[] = [{ label: `${win.drive}\\`, path: rootPath }];
    let acc = `/${win.drive}`;
    for (const part of win.rest) {
      acc += `/${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }

  const path = normPosix(raw);
  const crumbs: PathCrumb[] = [{ label: "/", path: "/" }];
  if (path === "/") return crumbs;
  let acc = "";
  for (const part of path.slice(1).split("/")) {
    if (!part) continue;
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function splitLocalCrumbs(raw: string): PathCrumb[] {
  const trimmed = raw.trim();
  const winDrive = trimmed.match(/^([a-zA-Z]:)(?:[\\/](.*))?$/);
  if (winDrive) {
    const drive = `${winDrive[1]}\\`;
    const crumbs: PathCrumb[] = [{ label: drive, path: drive }];
    const rest = (winDrive[2] ?? "").split(/[\\/]+/).filter(Boolean);
    let acc = drive;
    for (const part of rest) {
      acc = acc.endsWith("\\") ? `${acc}${part}` : `${acc}\\${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }
  return splitRemoteCrumbs(trimmed);
}

export function posixCdCmd(remotePath: string): string {
  const win = parseWinSftpPath(remotePath);
  if (win) {
    const winPath = `${win.drive}\\${win.rest.join("\\")}`;
    return `cd "${winPath.replace(/"/g, '\\"')}"\r`;
  }
  return `cd -- '${normPosix(remotePath).replace(/'/g, `'\\''`)}'\r`;
}
