export type ShortcutActionId =
  | "newTab"
  | "duplicateTab"
  | "closeTab"
  | "nextTab"
  | "prevTab"
  | "commandPalette"
  | "toggleSidebar"
  | "toggleSftpPanel"
  | "openSettings"
  | "toggleFullscreen"
  | "termCopy"
  | "termPaste"
  | "termSelectAll"
  | "termClear"
  | "termFind"
  | "termZoomIn"
  | "termZoomOut"
  | "termZoomReset";

export type ShortcutScope = "global" | "terminal";

export interface ShortcutDefinition {
  id: ShortcutActionId;
  scope: ShortcutScope;
  defaultChord: string;
  labelKey: string;
}

export type KeybindingOverrides = Partial<Record<ShortcutActionId, string>>;

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { id: "newTab", scope: "global", defaultChord: "Ctrl+Shift+T", labelKey: "settings.action_new_tab" },
  { id: "duplicateTab", scope: "global", defaultChord: "Ctrl+Shift+D", labelKey: "settings.action_duplicate_tab" },
  { id: "closeTab", scope: "global", defaultChord: "Ctrl+Shift+W", labelKey: "settings.action_close_tab" },
  { id: "nextTab", scope: "global", defaultChord: "Ctrl+Tab", labelKey: "settings.action_next_tab" },
  { id: "prevTab", scope: "global", defaultChord: "Ctrl+Shift+Tab", labelKey: "settings.action_prev_tab" },
  { id: "commandPalette", scope: "global", defaultChord: "Ctrl+Shift+K", labelKey: "settings.action_command_palette" },
  { id: "toggleSidebar", scope: "global", defaultChord: "Ctrl+Shift+B", labelKey: "settings.action_toggle_sidebar" },
  { id: "toggleSftpPanel", scope: "global", defaultChord: "Ctrl+Shift+E", labelKey: "settings.action_toggle_sftp" },
  { id: "openSettings", scope: "global", defaultChord: "Ctrl+,", labelKey: "settings.action_open_settings" },
  { id: "toggleFullscreen", scope: "global", defaultChord: "F11", labelKey: "settings.action_toggle_fullscreen" },
  { id: "termCopy", scope: "terminal", defaultChord: "Ctrl+Shift+C", labelKey: "settings.action_term_copy" },
  { id: "termPaste", scope: "terminal", defaultChord: "Ctrl+Shift+V", labelKey: "settings.action_term_paste" },
  { id: "termSelectAll", scope: "terminal", defaultChord: "Ctrl+Shift+A", labelKey: "settings.action_term_select_all" },
  { id: "termClear", scope: "terminal", defaultChord: "Ctrl+Shift+L", labelKey: "settings.action_term_clear" },
  { id: "termFind", scope: "global", defaultChord: "Ctrl+Shift+F", labelKey: "settings.action_term_find" },
  { id: "termZoomIn", scope: "terminal", defaultChord: "Ctrl+=", labelKey: "settings.action_term_zoom_in" },
  { id: "termZoomOut", scope: "terminal", defaultChord: "Ctrl+-", labelKey: "settings.action_term_zoom_out" },
  { id: "termZoomReset", scope: "terminal", defaultChord: "Ctrl+0", labelKey: "settings.action_term_zoom_reset" },
] as const;

export const DEFAULT_KEYBINDINGS: Record<ShortcutActionId, string> = SHORTCUT_DEFINITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item.defaultChord;
    return acc;
  },
  {} as Record<ShortcutActionId, string>
);

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "AltGraph"]);

const SPECIAL_KEY_ALIASES: Record<string, string> = {
  tab: "Tab",
  enter: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  space: "Space",
  plus: "=",
  minus: "-",
};

function normalizeBaseKeyFromToken(rawToken: string): string | null {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "ctrl" || lower === "control" || lower === "alt" || lower === "shift" || lower === "meta") {
    return null;
  }
  if (/^f([1-9]|1[0-2])$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (SPECIAL_KEY_ALIASES[lower]) {
    return SPECIAL_KEY_ALIASES[lower];
  }
  if (trimmed.length === 1 && trimmed.charCodeAt(0) > 0x20 && trimmed.charCodeAt(0) < 0x7f) {
    if (trimmed === "+") return "=";
    if (trimmed === "_") return "-";
    return trimmed.toUpperCase();
  }
  return null;
}

/** Normalizes a string chord like "ctrl + shift + t" into canonical "Ctrl+Shift+T", or null if invalid. */
export function normalizeShortcutChord(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split("+").map((t) => t.trim()).filter(Boolean);
  // Handle trailing "+" token like "Ctrl++" -> "="
  const hasTrailingPlus = /\+\s*\+$/.test(trimmed);
  let ctrl = false;
  let alt = false;
  let shift = false;
  let baseKey: string | null = hasTrailingPlus ? "=" : null;

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (lower === "ctrl" || lower === "control" || lower === "cmd" || lower === "meta") {
      ctrl = true;
    } else if (lower === "alt" || lower === "option") {
      alt = true;
    } else if (lower === "shift") {
      shift = true;
    } else if (!baseKey) {
      baseKey = normalizeBaseKeyFromToken(tok);
      if (!baseKey) return null;
    } else {
      return null;
    }
  }

  if (!baseKey) return null;
  const out: string[] = [];
  if (ctrl) out.push("Ctrl");
  if (alt) out.push("Alt");
  if (shift) out.push("Shift");
  out.push(baseKey);
  return out.join("+");
}

/** Checks whether a normalized chord is safe to bind as an application/terminal shortcut. */
export function isValidShortcutChord(chord: string): boolean {
  const normalized = normalizeShortcutChord(chord);
  if (!normalized || normalized !== chord) return false;
  if (normalized === "Alt+F4") return false;
  const parts = normalized.split("+");
  const key = parts[parts.length - 1];
  const hasCtrlOrAlt = parts.includes("Ctrl") || parts.includes("Alt");
  const isFnKey = /^F([1-9]|1[0-2])$/.test(key);
  return hasCtrlOrAlt || isFnKey;
}

/** Converts a DOM KeyboardEvent into a canonical shortcut chord string, or null if modifier-only / unsupported. */
export function eventToShortcutChord(e: KeyboardEvent): string | null {
  if (e.ctrlKey && e.metaKey) return null;
  if (MODIFIER_KEYS.has(e.key)) return null;

  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  const code = e.code ?? "";

  let baseKey: string | null = null;
  if (/^F([1-9]|1[0-2])$/i.test(e.key)) {
    baseKey = e.key.toUpperCase();
  } else if (e.key === " ") {
    baseKey = "Space";
  } else if (code.startsWith("Digit") && code.length === 6) {
    baseKey = code.slice(5);
  } else if (code.startsWith("Key") && code.length === 4) {
    baseKey = code.slice(3).toUpperCase();
  } else if (code === "Minus" || code === "NumpadSubtract" || e.key === "-" || e.key === "_") {
    baseKey = "-";
  } else if (code === "Equal" || code === "NumpadAdd" || e.key === "=" || e.key === "+") {
    baseKey = "=";
  } else if (code === "Comma" || e.key === ",") {
    baseKey = ",";
  } else if (code === "Period" || e.key === ".") {
    baseKey = ".";
  } else if (code === "Slash" || e.key === "/") {
    baseKey = "/";
  } else if (code === "Backquote" || e.key === "`") {
    baseKey = "`";
  } else {
    baseKey = normalizeBaseKeyFromToken(e.key);
  }

  if (!baseKey) return null;
  const out: string[] = [];
  if (ctrl) out.push("Ctrl");
  if (alt) out.push("Alt");
  if (shift) out.push("Shift");
  out.push(baseKey);
  return out.join("+");
}

/** Resolves the effective shortcut chord for a given action ID. */
export function getShortcutChord(
  actionId: ShortcutActionId,
  overrides?: KeybindingOverrides
): string {
  const custom = overrides?.[actionId];
  if (custom && isValidShortcutChord(custom)) {
    return custom;
  }
  return DEFAULT_KEYBINDINGS[actionId];
}

/** Finds another action that already uses `chord`, excluding `ignoreActionId`. */
export function findConflictingShortcut(
  chord: string,
  overrides: KeybindingOverrides | undefined,
  ignoreActionId?: ShortcutActionId
): ShortcutDefinition | null {
  for (const def of SHORTCUT_DEFINITIONS) {
    if (def.id === ignoreActionId) continue;
    if (getShortcutChord(def.id, overrides) === chord) {
      return def;
    }
  }
  if (chord === "Ctrl+F" && ignoreActionId !== "termFind") {
    return SHORTCUT_DEFINITIONS.find((def) => def.id === "termFind") ?? null;
  }
  return null;
}

/** Sanitizes persisted keybinding overrides, dropping invalid, duplicate, or default-matching entries. */
export function sanitizeKeybindings(raw: unknown): KeybindingOverrides {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const defsById = new Map(SHORTCUT_DEFINITIONS.map((d) => [d.id, d]));
  const candidateEntries: Array<[ShortcutActionId, string]> = [];
  const candidateIds = new Set<ShortcutActionId>();

  for (const [key, val] of Object.entries(obj)) {
    const def = defsById.get(key as ShortcutActionId);
    if (!def || typeof val !== "string") continue;
    const normalized = normalizeShortcutChord(val);
    if (!normalized || !isValidShortcutChord(normalized)) continue;
    if (normalized === def.defaultChord) continue;
    candidateEntries.push([def.id, normalized]);
    candidateIds.add(def.id);
  }

  const used = new Set<string>();
  for (const def of SHORTCUT_DEFINITIONS) {
    if (!candidateIds.has(def.id)) {
      used.add(def.defaultChord);
    }
  }
  const termFindUsesCtrlF = candidateEntries.some(
    ([id, ch]) => id === "termFind" && ch === "Ctrl+F"
  );
  if (!termFindUsesCtrlF) {
    used.add("Ctrl+F");
  }

  const sanitized: KeybindingOverrides = {};
  for (const [id, custom] of candidateEntries) {
    if (used.has(custom)) {
      const def = defsById.get(id);
      if (def) used.add(def.defaultChord);
      continue;
    }
    used.add(custom);
    sanitized[id] = custom;
  }
  return sanitized;
}
