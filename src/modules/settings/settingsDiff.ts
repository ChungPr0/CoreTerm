import { DEFAULT_CONFLICT_POLICY, DEFAULT_SHELL_ID } from "@/shared/defaults";
import type { SftpConflictPolicy, ShellProfile } from "@/shared/types/ipc";
import type { AppSettingsValues } from "./types";

function areShellProfilesEqual(a: ShellProfile, b: ShellProfile): boolean {
  if (
    a.id !== b.id ||
    a.kind !== b.kind ||
    a.name !== b.name ||
    a.executable !== b.executable ||
    a.args.length !== b.args.length
  ) {
    return false;
  }
  for (let i = 0; i < a.args.length; i++) {
    if (a.args[i] !== b.args[i]) return false;
  }
  return true;
}

function areCustomShellListsEqual(a: ShellProfile[], b: ShellProfile[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!areShellProfilesEqual(a[i], b[i])) return false;
  }
  return true;
}

export interface SettingsDraftState {
  cols: number;
  rows: number;
  sftpConflictPolicy: SftpConflictPolicy;
  effectiveDefaultShellId: string;
  initialEffectiveDefaultShellId: string;
  customShells: ShellProfile[];
  contextMenuDraft: boolean;
  contextMenuOriginal: boolean;
  hasDirtyShellEditor?: boolean;
}

/**
 * Returns true if any draft field in SettingsModal differs from the saved settings.
 */
export function hasSettingsChanges(
  saved: AppSettingsValues,
  draft: SettingsDraftState
): boolean {
  if (draft.hasDirtyShellEditor) return true;
  if (draft.cols !== saved.launchCols) return true;
  if (draft.rows !== saved.launchRows) return true;
  if (draft.sftpConflictPolicy !== (saved.sftpConflictPolicy ?? DEFAULT_CONFLICT_POLICY)) {
    return true;
  }
  if (draft.contextMenuDraft !== draft.contextMenuOriginal) return true;
  if (
    (draft.effectiveDefaultShellId || DEFAULT_SHELL_ID) !==
    (draft.initialEffectiveDefaultShellId || DEFAULT_SHELL_ID)
  ) {
    return true;
  }
  return !areCustomShellListsEqual(draft.customShells, saved.customShells ?? []);
}
