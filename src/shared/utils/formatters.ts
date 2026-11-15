const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes === 0) return "0 B";
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value >= 10 || unitIdx === 0 ? value.toFixed(0) : value.toFixed(1)} ${SIZE_UNITS[unitIdx]}`;
}

export function fmtSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "";
  return `${fmtSize(bps)}/s`;
}

export function fmtTime(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "-";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMode(mode: number): string {
  return `0${(mode & 0o777).toString(8).padStart(3, "0")}`;
}
