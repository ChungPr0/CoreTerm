import type { HostProfileSummaryDto } from "../types";

export function groupAndSortProfiles(
  profiles: HostProfileSummaryDto[],
  groups: string[],
  isFiltering: boolean
): Array<[string, HostProfileSummaryDto[]]> {
  const map = new Map<string, HostProfileSummaryDto[]>();
  const canonByLower = new Map<string, string>();
  const rankByLower = new Map<string, number>();

  groups.forEach((g, idx) => {
    const cleaned = g.trim();
    const key = cleaned.toLowerCase();
    if (!key) return;
    if (!canonByLower.has(key)) canonByLower.set(key, cleaned);
    if (!rankByLower.has(key)) rankByLower.set(key, idx);
  });

  const ensureGroup = (rawName: string): string => {
    const cleaned = rawName.trim() || "Default";
    const key = cleaned.toLowerCase();
    const canonical = canonByLower.get(key) ?? cleaned;
    canonByLower.set(key, canonical);
    if (!map.has(canonical)) map.set(canonical, []);
    return canonical;
  };

  if (!isFiltering) {
    for (const g of groups) ensureGroup(g);
  }
  for (const p of profiles) {
    map.get(ensureGroup(p.group_name || "Default"))!.push(p);
  }

  return Array.from(map.entries()).sort(([a], [b]) => {
    const rankA = rankByLower.get(a.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rankB = rankByLower.get(b.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    const aDef = a.toLowerCase() === "default";
    const bDef = b.toLowerCase() === "default";
    if (aDef !== bDef) return aDef ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}
