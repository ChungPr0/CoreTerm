import { create } from "zustand";
import type { ShellProfile } from "@/shared/types/ipc";
import { DEFAULT_LOCAL_SHELL } from "@/modules/workspace";
import { detectAvailableShells } from "../api/sessionApi";

export function resolveDefaultShell(
  shells: ShellProfile[],
  preferredId?: string
): ShellProfile {
  if (shells.length === 0) return DEFAULT_LOCAL_SHELL;
  if (preferredId) {
    const preferred = shells.find((s) => s.id === preferredId);
    if (preferred) return preferred;
  }
  return shells.find((s) => s.id === "powershell") ?? shells[0];
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
