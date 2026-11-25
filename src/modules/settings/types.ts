import type {
  SettingsCategoryId,
  SftpConflictPolicy,
  ShellProfile,
  StrictHostKeyChecking,
} from "@/shared/types/ipc";
import type { KeybindingOverrides } from "@/shared/utils/shortcuts";

export type { KeybindingOverrides, SettingsCategoryId };

export type CloseLastTabBehavior = "exit" | "new_local";
export type DefaultImeMode = "default" | "alphanumeric";
export type StartupBehavior = "default_profile" | "restore_session";
export type NewInstanceBehavior = "attach" | "new_window";
export type LaunchMode = "default" | "maximized" | "fullscreen";
export type NewTabPosition = "end" | "after_current";
export type TabWidthMode = "equal" | "title_length" | "compact";
export type TerminalCursorStyle = "block" | "bar" | "underline";
export type WarnPasteMultilineMode = "bracketed_disabled" | "always" | "never";
export type SftpDoubleClickAction = "edit" | "transfer";
export type EditorTabSize = 2 | 4 | 8;

export interface AppSettingsValues {
  // General
  closeLastTabBehavior: CloseLastTabBehavior;

  // Startup
  launchCols: number;
  launchRows: number;
  defaultImeMode: DefaultImeMode;
  startupBehavior: StartupBehavior;
  newInstanceBehavior: NewInstanceBehavior;
  launchMode: LaunchMode;
  centerOnLaunch: boolean;

  // Appearance
  alwaysOnTop: boolean;
  useActiveTabTitle: boolean;
  showAdminShield: boolean;
  newTabPosition: NewTabPosition;
  tabWidthMode: TabWidthMode;
  showTabsInFullscreen: boolean;

  // Interaction & Warnings
  terminalCopyOnSelect: boolean;
  terminalRightClickPaste: boolean;
  terminalTrimPasteWhitespace: boolean;
  terminalCtrlScrollZoom: boolean;
  terminalDetectUrls: boolean;
  warnCloseMultiTabs: boolean;
  warnPasteLarge: boolean;
  warnPasteMultiline: WarnPasteMultilineMode;

  // Actions (Keyboard Shortcuts)
  keybindings: KeybindingOverrides;

  // Terminal
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalLineHeight: number;
  terminalCursorStyle: TerminalCursorStyle;
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  terminalWebglRenderer: boolean;

  // Local Shells
  defaultShellId: string;
  defaultShellProfile?: ShellProfile;
  customShells: ShellProfile[];

  // SSH Defaults
  sshDefaultUsername: string;
  sshDefaultPort: number;
  sshDefaultKeepAlive: number;
  sshDefaultStrictHostKey: StrictHostKeyChecking;
  sshDefaultCompression: boolean;
  sshDefaultForwardAgent: boolean;
  sshDefaultAutoReconnect: boolean;
  sshDefaultReconnectIntervalSec: number;

  // SFTP
  sftpConflictPolicy: SftpConflictPolicy;
  sftpShowHiddenFiles: boolean;
  sftpShowLocalInSplit: boolean;
  sftpConfirmBeforeTransfer: boolean;
  sftpDoubleClickFileAction: SftpDoubleClickAction;

  // Editor
  editorFontSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  editorHighlightActiveLine: boolean;
  editorTabSize: EditorTabSize;
}
