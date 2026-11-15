export function normPosix(raw: string): string {
  const s = raw.trim().replace(/\/+/g, "/");
  if (!s || s === "/") return "/";
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

export function posixParent(raw: string): string {
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
  return base === "/" ? `/${name}` : `${base}/${name}`;
}

export interface PathCrumb {
  label: string;
  path: string;
}

export function splitRemoteCrumbs(raw: string): PathCrumb[] {
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
  return `cd -- '${normPosix(remotePath).replace(/'/g, `'\\''`)}'\r`;
}
