import {
  clampEditorFontSize,
  clampLaunchCols,
  clampLaunchRows,
  clampSshKeepAlive,
  clampSshPort,
  clampSshReconnectInterval,
  clampTermFontSize,
  clampTermLineHeight,
  clampTermScrollback,
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_SHELL_ID,
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_TAB_SIZE_DEFAULT,
  LAUNCH_COLS_DEFAULT,
  LAUNCH_ROWS_DEFAULT,
  SSH_DEFAULT_KEEPALIVE,
  SSH_DEFAULT_PORT,
  SSH_DEFAULT_RECONNECT_SEC,
  SSH_DEFAULT_USERNAME,
  TERMINAL_FONT_PRESETS,
  TERM_FONT_FAMILY_DEFAULT,
  TERM_FONT_SIZE_DEFAULT,
  TERM_LINE_HEIGHT_DEFAULT,
  TERM_SCROLLBACK_DEFAULT,
} from "@/shared/defaults";
import type {
  SftpConflictPolicy,
  ShellProfile,
  StrictHostKeyChecking,
} from "@/shared/types/ipc";
import type {
  AppSettingsValues,
  CloseLastTabBehavior,
  DefaultImeMode,
  EditorTabSize,
  LaunchMode,
  NewInstanceBehavior,
  SftpDoubleClickAction,
  StartupBehavior,
  TerminalCursorStyle,
} from "./types";

const SETTINGS_STORAGE_KEY = "coreterm_settings";

export const DEFAULT_SETTINGS: AppSettingsValues = {
  launchCols: LAUNCH_COLS_DEFAULT,
  launchRows: LAUNCH_ROWS_DEFAULT,
  closeLastTabBehavior: "exit",
  defaultImeMode: "default",
  startupBehavior: "default_profile",
  newInstanceBehavior: "attach",
  launchMode: "default",
  centerOnLaunch: false,
  alwaysOnTop: false,

  terminalFontSize: TERM_FONT_SIZE_DEFAULT,
  terminalFontFamily: TERM_FONT_FAMILY_DEFAULT,
  terminalLineHeight: TERM_LINE_HEIGHT_DEFAULT,
  terminalCursorStyle: "block",
  terminalCursorBlink: true,
  terminalScrollback: TERM_SCROLLBACK_DEFAULT,
  terminalCopyOnSelect: false,
  terminalRightClickPaste: false,
  terminalWebglRenderer: true,

  defaultShellId: DEFAULT_SHELL_ID,
  defaultShellProfile: undefined,
  customShells: [],

  sshDefaultUsername: SSH_DEFAULT_USERNAME,
  sshDefaultPort: SSH_DEFAULT_PORT,
  sshDefaultKeepAlive: SSH_DEFAULT_KEEPALIVE,
  sshDefaultStrictHostKey: "ACCEPT_NEW",
  sshDefaultCompression: false,
  sshDefaultForwardAgent: false,
  sshDefaultAutoReconnect: false,
  sshDefaultReconnectIntervalSec: SSH_DEFAULT_RECONNECT_SEC,

  sftpConflictPolicy: DEFAULT_CONFLICT_POLICY,
  sftpShowHiddenFiles: true,
  sftpShowLocalInSplit: false,
  sftpConfirmBeforeTransfer: true,
  sftpDoubleClickFileAction: "edit",

  editorFontSize: EDITOR_FONT_SIZE_DEFAULT,
  editorWordWrap: false,
  editorLineNumbers: true,
  editorHighlightActiveLine: true,
  editorTabSize: EDITOR_TAB_SIZE_DEFAULT,
};

function parseShellProfile(
  value: unknown,
  fallbackKind?: string
): ShellProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const executable = typeof obj.executable === "string" ? obj.executable.trim() : "";
  const kind =
    typeof obj.kind === "string" && obj.kind.trim()
      ? obj.kind.trim()
      : fallbackKind ?? "";
  if (
    !id ||
    !kind ||
    !name ||
    !executable ||
    !Array.isArray(obj.args) ||
    !obj.args.every((a) => typeof a === "string")
  ) {
    return undefined;
  }
  return {
    id,
    kind,
    name,
    executable,
    args: obj.args,
  };
}

function parseCustomShells(value: unknown): ShellProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ShellProfile[] = [];
  for (const item of value) {
    const profile = parseShellProfile(item, "custom");
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
  }
  return out;
}

export function parseConflictPolicy(value: unknown): SftpConflictPolicy {
  if (
    value === "OVERWRITE" ||
    value === "SKIP" ||
    value === "RENAME" ||
    value === "RESUME" ||
    value === "ASK"
  ) {
    return value;
  }
  return "ASK";
}

function parseCloseLastTab(value: unknown): CloseLastTabBehavior {
  return value === "new_local" ? "new_local" : "exit";
}

function parseImeMode(value: unknown): DefaultImeMode {
  return value === "alphanumeric" ? "alphanumeric" : "default";
}

function parseStartupBehavior(value: unknown): StartupBehavior {
  return value === "restore_session" ? "restore_session" : "default_profile";
}

function parseNewInstanceBehavior(value: unknown): NewInstanceBehavior {
  return value === "new_window" ? "new_window" : "attach";
}

function parseLaunchMode(value: unknown): LaunchMode {
  return value === "maximized" || value === "fullscreen" ? value : "default";
}

function parseCursorStyle(value: unknown): TerminalCursorStyle {
  return value === "bar" || value === "underline" || value === "block"
    ? value
    : "block";
}

function parseStrictHostKey(value: unknown): StrictHostKeyChecking {
  return value === "YES" || value === "NO" || value === "ACCEPT_NEW"
    ? value
    : "ACCEPT_NEW";
}

function parseSftpDoubleClick(value: unknown): SftpDoubleClickAction {
  return value === "transfer" ? "transfer" : "edit";
}

function parseEditorTabSize(value: unknown): EditorTabSize {
  const n = Number(value);
  return n === 4 || n === 8 ? n : 2;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseDefaultUsername(value: unknown): string {
  if (typeof value !== "string") return SSH_DEFAULT_USERNAME;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("-") || /\s/.test(trimmed) || /[\x00-\x1F\x7F]/.test(trimmed)) {
    return SSH_DEFAULT_USERNAME;
  }
  return trimmed;
}

/** Sanitizes arbitrary persisted or partial settings into a valid AppSettingsValues object. */
export function sanitizeSettings(raw: unknown): AppSettingsValues {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS, customShells: [] };
  }
  const parsed = raw as Record<string, unknown>;
  const rawFontFamily =
    typeof parsed.terminalFontFamily === "string"
      ? parsed.terminalFontFamily.trim()
      : "";
  const fontFamily = TERMINAL_FONT_PRESETS.some((p) => p.value === rawFontFamily)
    ? rawFontFamily
    : TERM_FONT_FAMILY_DEFAULT;

  return {
    launchCols: clampLaunchCols(parsed.launchCols),
    launchRows: clampLaunchRows(parsed.launchRows),
    closeLastTabBehavior: parseCloseLastTab(parsed.closeLastTabBehavior),
    defaultImeMode: parseImeMode(parsed.defaultImeMode),
    startupBehavior: parseStartupBehavior(parsed.startupBehavior),
    newInstanceBehavior: parseNewInstanceBehavior(parsed.newInstanceBehavior),
    launchMode: parseLaunchMode(parsed.launchMode),
    centerOnLaunch: parseBool(parsed.centerOnLaunch, false),
    alwaysOnTop: parseBool(parsed.alwaysOnTop, false),

    terminalFontSize: clampTermFontSize(parsed.terminalFontSize),
    terminalFontFamily: fontFamily,
    terminalLineHeight: clampTermLineHeight(parsed.terminalLineHeight),
    terminalCursorStyle: parseCursorStyle(parsed.terminalCursorStyle),
    terminalCursorBlink: parseBool(parsed.terminalCursorBlink, true),
    terminalScrollback: clampTermScrollback(parsed.terminalScrollback),
    terminalCopyOnSelect: parseBool(parsed.terminalCopyOnSelect, false),
    terminalRightClickPaste: parseBool(parsed.terminalRightClickPaste, false),
    terminalWebglRenderer: parseBool(parsed.terminalWebglRenderer, true),

    defaultShellId:
      typeof parsed.defaultShellId === "string" && parsed.defaultShellId.trim()
        ? parsed.defaultShellId.trim()
        : DEFAULT_SHELL_ID,
    defaultShellProfile: parseShellProfile(parsed.defaultShellProfile),
    customShells: parseCustomShells(parsed.customShells),

    sshDefaultUsername: parseDefaultUsername(parsed.sshDefaultUsername),
    sshDefaultPort: clampSshPort(parsed.sshDefaultPort),
    sshDefaultKeepAlive: clampSshKeepAlive(parsed.sshDefaultKeepAlive),
    sshDefaultStrictHostKey: parseStrictHostKey(parsed.sshDefaultStrictHostKey),
    sshDefaultCompression: parseBool(parsed.sshDefaultCompression, false),
    sshDefaultForwardAgent: parseBool(parsed.sshDefaultForwardAgent, false),
    sshDefaultAutoReconnect: parseBool(parsed.sshDefaultAutoReconnect, false),
    sshDefaultReconnectIntervalSec: clampSshReconnectInterval(
      parsed.sshDefaultReconnectIntervalSec
    ),

    sftpConflictPolicy: parseConflictPolicy(parsed.sftpConflictPolicy),
    sftpShowHiddenFiles: parseBool(parsed.sftpShowHiddenFiles, true),
    sftpShowLocalInSplit: parseBool(parsed.sftpShowLocalInSplit, false),
    sftpConfirmBeforeTransfer: parseBool(parsed.sftpConfirmBeforeTransfer, true),
    sftpDoubleClickFileAction: parseSftpDoubleClick(parsed.sftpDoubleClickFileAction),

    editorFontSize: clampEditorFontSize(parsed.editorFontSize),
    editorWordWrap: parseBool(parsed.editorWordWrap, false),
    editorLineNumbers: parseBool(parsed.editorLineNumbers, true),
    editorHighlightActiveLine: parseBool(parsed.editorHighlightActiveLine, true),
    editorTabSize: parseEditorTabSize(parsed.editorTabSize),
  };
}

export function loadSettings(): AppSettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return sanitizeSettings(JSON.parse(raw));
    }
  } catch {
    // Fallback to defaults
  }
  return { ...DEFAULT_SETTINGS, customShells: [] };
}

export function saveSettings(next: AppSettingsValues): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
