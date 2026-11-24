import type {
  SettingsCategoryId,
  SftpConflictPolicy,
  ShellProfile,
  StrictHostKeyChecking,
} from "@/shared/types/ipc";

export type { SettingsCategoryId };

export type CloseLastTabBehavior = "exit" | "new_local";
export type DefaultImeMode = "default" | "alphanumeric";
export type StartupBehavior = "default_profile" | "restore_session";
export type NewInstanceBehavior = "attach" | "new_window";
export type LaunchMode = "default" | "maximized" | "fullscreen";
export type TerminalCursorStyle = "block" | "bar" | "underline";
export type SftpDoubleClickAction = "edit" | "transfer";
export type EditorTabSize = 2 | 4 | 8;

export interface AppSettingsValues {
  // General
  launchCols: number;
  launchRows: number;
  closeLastTabBehavior: CloseLastTabBehavior;
  defaultImeMode: DefaultImeMode;
  startupBehavior: StartupBehavior;
  newInstanceBehavior: NewInstanceBehavior;
  launchMode: LaunchMode;
  centerOnLaunch: boolean;
  alwaysOnTop: boolean;

  // Terminal
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalLineHeight: number;
  terminalCursorStyle: TerminalCursorStyle;
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  terminalCopyOnSelect: boolean;
  terminalRightClickPaste: boolean;
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
