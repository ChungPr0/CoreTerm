import type { EditorTabMeta, FileWriteResultDto, TerminalTabItem } from "@/shared/types/ipc";
import type { ContextMenuEntry } from "@/shared/ui";

export type EditorLineEnding = "LF" | "CRLF";

export type EditorDiscardAction = "close" | "reload" | null;

export interface EditorCursorPos {
  line: number;
  col: number;
  selLen: number;
}

export interface FileEditorPaneProps {
  tab: TerminalTabItem;
  file: EditorTabMeta;
  isActive: boolean;
  hasBlockingModal?: boolean;
  hasTopLevelModal?: boolean;
  pauseAutoReconnect?: boolean;
  findToken?: number;
  closeRequestToken?: number;
  onDirtyChange: (dirty: boolean) => void;
  onForceClose: () => void;
  onCancelCloseRequest?: () => void;
  onShowMenu: (x: number, y: number, items: ContextMenuEntry[]) => void;
  onModalChange?: (tabId: string, open: boolean) => void;
  onSaved?: (res: FileWriteResultDto) => void;
  onOpenSettings?: () => void;
  onOpenSshTab?: () => void;
  onOpenSftpTab?: () => void;
}
