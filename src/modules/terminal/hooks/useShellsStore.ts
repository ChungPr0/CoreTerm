import { create } from "zustand";
import { DEFAULT_SHELL_PRIORITY } from "@/shared/defaults";
import type { ShellProfile } from "@/shared/types/ipc";
import { DEFAULT_LOCAL_SHELL } from "@/modules/workspace";
import { detectAvailableShells } from "../api/sessionApi";

export function mergeShells(
  detected: ShellProfile[],
  custom: ShellProfile[]
): ShellProfile[] {
  const seen = new Set<string>();
  const out: ShellProfile[] = [];
  for (const shell of [...detected, ...custom]) {
    if (!shell.id || seen.has(shell.id)) continue;
    seen.add(shell.id);
    out.push(shell);
  }
  return out;
}

export function resolveDefaultShell(
  shells: ShellProfile[],
  preferredId?: string
): ShellProfile | null {
  if (shells.length === 0) return null;
  if (preferredId) {
    const preferred = shells.find((s) => s.id === preferredId);
    if (preferred) return preferred;
  }
  for (const kindId of DEFAULT_SHELL_PRIORITY) {
    const candidate = shells.find((s) => s.id === kindId || s.kind === kindId);
    if (candidate) return candidate;
  }
  return shells[0];
}

export function parseShellArgs(raw: string): string[] {
  const args: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let tokenStarted = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      tokenStarted = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      tokenStarted = true;
    } else if (/\s/.test(ch)) {
      if (tokenStarted) {
        args.push(cur);
        cur = "";
        tokenStarted = false;
      }
    } else {
      cur += ch;
      tokenStarted = true;
    }
  }
  if (tokenStarted) args.push(cur);
  return args;
}

export function formatShellArgs(args: string[]): string {
  return args
    .map((a) => (/[\s"']/.test(a) || a.length === 0 ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(" ");
}

export function shellNameFromPath(executablePath: string, fallback = "Custom Shell"): string {
  const file = executablePath.trim().split(/[/\\]/).pop() ?? "";
  return file.replace(/\.(exe|cmd|bat|com)$/i, "") || fallback;
}

export function makeCustomShell(input: {
  id?: string;
  name: string;
  executable: string;
  args?: string[];
}): ShellProfile {
  const exe = input.executable.trim();
  const name = input.name.trim() || shellNameFromPath(exe);
  return {
    id: input.id?.trim() || `custom:${crypto.randomUUID()}`,
    kind: "custom",
    name,
    executable: exe,
    args: input.args ?? [],
  };
}

interface ShellsStoreState {
  shells: ShellProfile[];
  isLoaded: boolean;
  detectShells: (refresh?: boolean) => Promise<ShellProfile[]>;
}

export const useShellsStore = create<ShellsStoreState>((set) => ({
  shells: [],
  isLoaded: false,
  detectShells: async (refresh = false) => {
    try {
      const shells = await detectAvailableShells(refresh);
      set({ shells, isLoaded: true });
      return shells;
    } catch {
      set((s) => ({
        shells: s.shells.length > 0 ? s.shells : [DEFAULT_LOCAL_SHELL],
        isLoaded: true,
      }));
      return [DEFAULT_LOCAL_SHELL];
    }
  },
}));
