import { PRIVILEGED_PORT_THRESHOLD } from "@/shared/defaults";
import type { ForwardType } from "@/shared/types/ipc";
import type { DraftPortForward } from "../components/hostFormTypes";

export function normalizeBindAddr(addr: string): string {
  const t = addr.trim().toLowerCase();
  return !t || t === "localhost" ? "127.0.0.1" : t;
}

export function isInvalidForwardHostOrAddr(raw: string): boolean {
  const clean = raw.trim();
  return clean.startsWith("-") || /\s/.test(clean) || /[;`&$|]/.test(clean);
}

export function isValidPortNumber(portNum: number): boolean {
  return Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
}

export function isPrivilegedPort(rawPort: string | number): boolean {
  const p = Number(rawPort);
  return Number.isInteger(p) && p > 0 && p < PRIVILEGED_PORT_THRESHOLD;
}

export function addressesConflict(aNorm: string, bNorm: string): boolean {
  return aNorm === bNorm || aNorm === "0.0.0.0" || bNorm === "0.0.0.0";
}

export function findDuplicateForwardRule(params: {
  forwardType: ForwardType;
  portLocal: string;
  ipLocal: string;
  portRemote: string;
  ipRemote: string;
  existingRules: DraftPortForward[];
  editingIndex: number | null;
}): { isDuplicate: boolean; conflictingName?: string } {
  const {
    forwardType,
    portLocal,
    ipLocal,
    portRemote,
    ipRemote,
    existingRules,
    editingIndex,
  } = params;
  const listenPortNum = forwardType === "REMOTE" ? Number(portRemote) : Number(portLocal);
  const listenAddr = forwardType === "REMOTE" ? ipRemote : ipLocal;

  if (!isValidPortNumber(listenPortNum)) {
    return { isDuplicate: false };
  }

  const curNormAddr = normalizeBindAddr(listenAddr);
  const curIsLocal = forwardType === "LOCAL" || forwardType === "DYNAMIC";

  for (let i = 0; i < existingRules.length; i++) {
    if (i === editingIndex) continue;
    const other = existingRules[i];
    if (!other.is_enabled) continue;

    const otherIsLocal = other.forward_type === "LOCAL" || other.forward_type === "DYNAMIC";

    if (curIsLocal && otherIsLocal && other.bind_port === listenPortNum) {
      if (addressesConflict(curNormAddr, normalizeBindAddr(other.bind_address))) {
        return { isDuplicate: true, conflictingName: other.label };
      }
    } else if (
      forwardType === "REMOTE" &&
      other.forward_type === "REMOTE" &&
      other.bind_port === listenPortNum
    ) {
      if (addressesConflict(curNormAddr, normalizeBindAddr(other.bind_address))) {
        return { isDuplicate: true, conflictingName: other.label };
      }
    }
  }
  return { isDuplicate: false };
}

export function buildForwardConflictMap(forwards: DraftPortForward[]): Map<number, string> {
  const map = new Map<number, string>();
  for (let i = 0; i < forwards.length; i++) {
    const a = forwards[i];
    if (!a.is_enabled) continue;
    const aIsLocal = a.forward_type === "LOCAL" || a.forward_type === "DYNAMIC";
    const aNorm = normalizeBindAddr(a.bind_address);

    for (let j = i + 1; j < forwards.length; j++) {
      const b = forwards[j];
      if (!b.is_enabled) continue;
      const bIsLocal = b.forward_type === "LOCAL" || b.forward_type === "DYNAMIC";
      const bNorm = normalizeBindAddr(b.bind_address);

      if (aIsLocal && bIsLocal && a.bind_port === b.bind_port) {
        if (addressesConflict(aNorm, bNorm)) {
          map.set(i, b.label);
          map.set(j, a.label);
        }
      } else if (
        a.forward_type === "REMOTE" &&
        b.forward_type === "REMOTE" &&
        a.bind_port === b.bind_port
      ) {
        if (addressesConflict(aNorm, bNorm)) {
          map.set(i, b.label);
          map.set(j, a.label);
        }
      }
    }
  }
  return map;
}
