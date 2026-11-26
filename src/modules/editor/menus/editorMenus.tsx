import {
  Clipboard,
  ClipboardCopy,
  Copy,
  CornerDownLeft,
  FolderSync,
  Hash,
  Lock,
  LockOpen,
  RefreshCw,
  Replace,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  Server,
  Settings as SettingsIcon,
  TextSelect,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ContextMenuEntry } from "@/shared/ui";
import { getShortcutChord } from "@/shared/utils/shortcuts";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import type { EditorLineEnding } from "../types";

export interface BuildEditorContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  editorReady?: boolean;
  hasSelection: boolean;
  readonly: boolean;
  fileReadonly?: boolean;
  isDirty: boolean;
  saving?: boolean;
  loading?: boolean;
  retrying?: boolean;
  connecting?: boolean;
  isRemoteConnecting?: boolean;
  wordWrap?: boolean;
  eol?: EditorLineEnding;
  isRemote: boolean;
  isDisconnected: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onFind: () => void;
  onReplace?: () => void;
  onGotoLine: () => void;
  onToggleWordWrap?: () => void;
  onToggleReadonly?: () => void;
  onToggleEol?: () => void;
  onSave: () => void;
  onReload: () => void;
  onReconnect?: () => void;
  onCopyPath: () => void;
  onOpenSshTab?: () => void;
  onOpenSftpTab?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export type BuildEditorToolbarMenuOpts = Omit<
  BuildEditorContextItemsOpts,
  "hasSelection" | "onCut" | "onCopy" | "onPaste" | "onSelectAll"
> &
  Partial<
    Pick<
      BuildEditorContextItemsOpts,
      "hasSelection" | "onCut" | "onCopy" | "onPaste" | "onSelectAll"
    >
  >;

export interface BuildEditorStatusBarMenuOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  editorReady: boolean;
  readonly: boolean;
  fileReadonly?: boolean;
  wordWrap: boolean;
  eol: EditorLineEnding;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onGotoLine: () => void;
  onToggleEol: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleWordWrap: () => void;
  onToggleReadonly: () => void;
  onCopyPath: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export interface BuildEditorBannerMenuOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  selectedText: string;
  isConnecting: boolean;
  reloadDisabled: boolean;
  onCopy: (text: string) => void;
  onReconnect: () => void;
  onReload: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

function appendSearchItems(
  items: ContextMenuEntry[],
  opts: {
    t: BuildEditorContextItemsOpts["t"];
    editorReady: boolean;
    readonly: boolean;
    onFind: () => void;
    onReplace?: () => void;
    onGotoLine: () => void;
  }
) {
  items.push({
    id: "editor-find",
    label: opts.t("ctx.find"),
    icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
    shortcut: "Ctrl+F",
    disabled: !opts.editorReady,
    onSelect: opts.onFind,
  });

  if (opts.onReplace) {
    items.push({
      id: "editor-replace",
      label: opts.t("ctx.replace"),
      icon: <Replace className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+H",
      disabled: !opts.editorReady || opts.readonly,
      onSelect: opts.onReplace,
    });
  }

  items.push({
    id: "editor-goto",
    label: opts.t("editor.goto_line_title"),
    icon: <Hash className="h-3.5 w-3.5" />,
    shortcut: "Ctrl+G",
    disabled: !opts.editorReady,
    onSelect: opts.onGotoLine,
  });
}

function appendViewItems(
  items: ContextMenuEntry[],
  opts: {
    t: BuildEditorContextItemsOpts["t"];
    editorReady: boolean;
    readonly: boolean;
    fileReadonly: boolean;
    wordWrap: boolean;
    eol?: EditorLineEnding;
    onToggleWordWrap?: () => void;
    onToggleReadonly?: () => void;
    onToggleEol?: () => void;
    idPrefix: "editor" | "status";
  }
) {
  if (opts.onToggleWordWrap) {
    items.push({
      id: `${opts.idPrefix}-word-wrap`,
      label: opts.t("editor.word_wrap"),
      icon: <WrapText className="h-3.5 w-3.5" />,
      badge: {
        text: opts.wordWrap ? opts.t("ctx.state_on") : opts.t("ctx.state_off"),
        active: opts.wordWrap,
      },
      disabled: !opts.editorReady,
      onSelect: opts.onToggleWordWrap,
    });
  }

  if (opts.onToggleReadonly) {
    items.push({
      id: `${opts.idPrefix}-readonly`,
      label: opts.readonly ? opts.t("editor.unlock_edit") : opts.t("editor.lock_readonly"),
      icon: opts.readonly ? (
        <Lock className="h-3.5 w-3.5 text-rose-400" />
      ) : (
        <LockOpen className="h-3.5 w-3.5" />
      ),
      disabled: !opts.editorReady || opts.fileReadonly,
      onSelect: opts.onToggleReadonly,
    });
  }

  if (opts.onToggleEol && opts.eol && opts.idPrefix === "editor") {
    items.push({
      id: "editor-eol",
      label: opts.t("editor.toggle_eol"),
      icon: <CornerDownLeft className="h-3.5 w-3.5" />,
      badge: { text: opts.eol, active: false },
      disabled: !opts.editorReady || opts.readonly,
      onSelect: opts.onToggleEol,
    });
  }
}

function appendFileAndSessionItems(
  items: ContextMenuEntry[],
  opts: {
    t: BuildEditorContextItemsOpts["t"];
    editorReady: boolean;
    readonly: boolean;
    isDirty: boolean;
    saving: boolean;
    loading: boolean;
    retrying: boolean;
    connecting: boolean;
    isRemoteConnecting: boolean;
    isRemote: boolean;
    isDisconnected: boolean;
    onSave: () => void;
    onReload: () => void;
    onReconnect?: () => void;
    onCopyPath: () => void;
    onOpenSshTab?: () => void;
    onOpenSftpTab?: () => void;
  }
) {
  items.push(
    {
      id: "editor-save",
      label: opts.t("editor.save"),
      icon: <Save className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+S",
      disabled:
        !opts.editorReady ||
        opts.readonly ||
        !opts.isDirty ||
        opts.saving ||
        (opts.isRemote && opts.isDisconnected),
      onSelect: opts.onSave,
    },
    {
      id: "editor-reload",
      label: opts.t("editor.reload"),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      disabled: opts.loading || opts.retrying || opts.saving || opts.connecting,
      onSelect: opts.onReload,
    }
  );

  if (opts.isRemote && opts.onReconnect) {
    items.push({
      id: "editor-reconnect",
      label: opts.t("common.reconnect"),
      icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
      disabled: opts.connecting || opts.isRemoteConnecting,
      onSelect: opts.onReconnect,
    });
  }

  items.push({
    id: "editor-copy-path",
    label: opts.t("ctx.sftp_copy_path"),
    icon: <Copy className="h-3.5 w-3.5" />,
    onSelect: opts.onCopyPath,
  });

  if (opts.isRemote && opts.onOpenSshTab) {
    items.push({
      id: "editor-open-ssh",
      label: opts.t("ctx.ssh_open_tab"),
      icon: <Server className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: opts.onOpenSshTab,
    });
  }

  if (opts.isRemote && opts.onOpenSftpTab) {
    items.push({
      id: "editor-open-sftp",
      label: opts.t("ctx.sftp_open_tab"),
      icon: <FolderSync className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: opts.onOpenSftpTab,
    });
  }
}

function appendCommonFooterItems(
  items: ContextMenuEntry[],
  opts: {
    t: BuildEditorContextItemsOpts["t"];
    idPrefix: "editor" | "status" | "editor-banner";
    sepId: string;
    onOpenSettings?: () => void;
    onClose?: () => void;
    omitSeparator?: boolean;
  }
) {
  if (!opts.onOpenSettings && !opts.onClose) return;
  const kb = useSettingsStore.getState().settings.keybindings;
  if (!opts.omitSeparator && items.length > 0) {
    items.push({ type: "separator", id: opts.sepId });
  }
  if (opts.onOpenSettings) {
    items.push({
      id: `${opts.idPrefix}-settings`,
      label: opts.t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: getShortcutChord("openSettings", kb),
      onSelect: opts.onOpenSettings,
    });
  }
  if (opts.onClose) {
    items.push({
      id: `${opts.idPrefix}-close`,
      label: opts.t("ctx.close_tab"),
      icon: <X className="h-3.5 w-3.5" />,
      shortcut: getShortcutChord("closeTab", kb),
      onSelect: opts.onClose,
    });
  }
}

export function buildEditorContextItems({
  t,
  editorReady = true,
  hasSelection,
  readonly,
  fileReadonly = false,
  isDirty,
  saving = false,
  loading = false,
  retrying = false,
  connecting = false,
  isRemoteConnecting = false,
  wordWrap = false,
  eol,
  isRemote,
  isDisconnected,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onFind,
  onReplace,
  onGotoLine,
  onToggleWordWrap,
  onToggleReadonly,
  onToggleEol,
  onSave,
  onReload,
  onReconnect,
  onCopyPath,
  onOpenSshTab,
  onOpenSftpTab,
  onOpenSettings,
  onClose,
}: BuildEditorContextItemsOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [
    {
      id: "editor-cut",
      label: t("ctx.cut"),
      icon: <Scissors className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+X",
      disabled: !editorReady || !hasSelection || readonly,
      onSelect: onCut,
    },
    {
      id: "editor-copy",
      label: t("ctx.copy"),
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+C",
      disabled: !editorReady || !hasSelection,
      onSelect: onCopy,
    },
    {
      id: "editor-paste",
      label: t("ctx.paste"),
      icon: <Clipboard className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+V",
      disabled: !editorReady || readonly,
      onSelect: onPaste,
    },
    {
      id: "editor-select-all",
      label: t("ctx.select_all"),
      icon: <TextSelect className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+A",
      disabled: !editorReady,
      onSelect: onSelectAll,
    },
    { type: "separator", id: "sep-editor-search" },
  ];

  appendSearchItems(items, {
    t,
    editorReady,
    readonly,
    onFind,
    onReplace,
    onGotoLine,
  });

  if (onToggleWordWrap || onToggleReadonly || (onToggleEol && eol)) {
    items.push({ type: "separator", id: "sep-editor-view" });
    appendViewItems(items, {
      t,
      editorReady,
      readonly,
      fileReadonly,
      wordWrap,
      eol,
      onToggleWordWrap,
      onToggleReadonly,
      onToggleEol,
      idPrefix: "editor",
    });
  }

  items.push({ type: "separator", id: "sep-editor-file" });
  appendFileAndSessionItems(items, {
    t,
    editorReady,
    readonly,
    isDirty,
    saving,
    loading,
    retrying,
    connecting,
    isRemoteConnecting,
    isRemote,
    isDisconnected,
    onSave,
    onReload,
    onReconnect,
    onCopyPath,
    onOpenSshTab,
    onOpenSftpTab,
  });

  appendCommonFooterItems(items, {
    t,
    idPrefix: "editor",
    sepId: "sep-editor-close",
    onOpenSettings,
    onClose,
  });

  return items;
}

export function buildEditorToolbarMenu({
  t,
  editorReady = true,
  readonly,
  fileReadonly = false,
  isDirty,
  saving = false,
  loading = false,
  retrying = false,
  connecting = false,
  isRemoteConnecting = false,
  wordWrap = false,
  eol,
  isRemote,
  isDisconnected,
  onFind,
  onReplace,
  onGotoLine,
  onToggleWordWrap,
  onToggleReadonly,
  onToggleEol,
  onSave,
  onReload,
  onReconnect,
  onCopyPath,
  onOpenSshTab,
  onOpenSftpTab,
  onOpenSettings,
  onClose,
}: BuildEditorToolbarMenuOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];

  appendFileAndSessionItems(items, {
    t,
    editorReady,
    readonly,
    isDirty,
    saving,
    loading,
    retrying,
    connecting,
    isRemoteConnecting,
    isRemote,
    isDisconnected,
    onSave,
    onReload,
    onReconnect,
    onCopyPath,
    onOpenSshTab,
    onOpenSftpTab,
  });

  items.push({ type: "separator", id: "sep-toolbar-search" });
  appendSearchItems(items, {
    t,
    editorReady,
    readonly,
    onFind,
    onReplace,
    onGotoLine,
  });

  if (onToggleWordWrap || onToggleReadonly || (onToggleEol && eol)) {
    items.push({ type: "separator", id: "sep-toolbar-view" });
    appendViewItems(items, {
      t,
      editorReady,
      readonly,
      fileReadonly,
      wordWrap,
      eol,
      onToggleWordWrap,
      onToggleReadonly,
      onToggleEol,
      idPrefix: "editor",
    });
  }

  appendCommonFooterItems(items, {
    t,
    idPrefix: "editor",
    sepId: "sep-toolbar-close",
    onOpenSettings,
    onClose,
  });

  return items;
}

export function buildEditorStatusBarMenu({
  t,
  editorReady,
  readonly,
  fileReadonly = false,
  wordWrap,
  eol,
  zoomPercent,
  canZoomIn,
  canZoomOut,
  onGotoLine,
  onToggleEol,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleWordWrap,
  onToggleReadonly,
  onCopyPath,
  onOpenSettings,
  onClose,
}: BuildEditorStatusBarMenuOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [
    {
      id: "status-goto",
      label: t("editor.goto_line_title"),
      icon: <Hash className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+G",
      disabled: !editorReady,
      onSelect: onGotoLine,
    },
    {
      id: "status-eol",
      label: t("editor.toggle_eol"),
      icon: <CornerDownLeft className="h-3.5 w-3.5" />,
      badge: { text: eol, active: false },
      disabled: !editorReady || readonly,
      onSelect: onToggleEol,
    },
    { type: "separator", id: "sep-status-zoom" },
    {
      id: "status-zoom-in",
      label: t("ctx.zoom_in"),
      icon: <ZoomIn className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+=",
      disabled: !canZoomIn,
      onSelect: onZoomIn,
    },
    {
      id: "status-zoom-out",
      label: t("ctx.zoom_out"),
      icon: <ZoomOut className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+-",
      disabled: !canZoomOut,
      onSelect: onZoomOut,
    },
    {
      id: "status-zoom-reset",
      label: t("ctx.zoom_reset"),
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+0",
      badge: { text: `${zoomPercent}%`, active: zoomPercent !== 100 },
      disabled: zoomPercent === 100,
      onSelect: onZoomReset,
    },
    { type: "separator", id: "sep-status-view" },
  ];

  appendViewItems(items, {
    t,
    editorReady,
    readonly,
    fileReadonly,
    wordWrap,
    onToggleWordWrap,
    onToggleReadonly,
    idPrefix: "status",
  });

  items.push(
    { type: "separator", id: "sep-status-file" },
    {
      id: "status-copy-path",
      label: t("ctx.sftp_copy_path"),
      icon: <Copy className="h-3.5 w-3.5" />,
      onSelect: onCopyPath,
    }
  );

  appendCommonFooterItems(items, {
    t,
    idPrefix: "status",
    sepId: "sep-status-close",
    onOpenSettings,
    onClose,
    omitSeparator: true,
  });

  return items;
}

export function buildEditorBannerMenu({
  t,
  selectedText,
  isConnecting,
  reloadDisabled,
  onCopy,
  onReconnect,
  onReload,
  onOpenSettings,
  onClose,
}: BuildEditorBannerMenuOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];
  if (selectedText.length > 0) {
    items.push(
      {
        id: "editor-banner-copy",
        label: t("ctx.copy"),
        icon: <ClipboardCopy className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+C",
        onSelect: () => onCopy(selectedText),
      },
      { type: "separator", id: "sep-editor-banner-copy" }
    );
  }

  items.push(
    {
      id: "editor-banner-reconnect",
      label: t("common.reconnect"),
      icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
      disabled: isConnecting,
      onSelect: onReconnect,
    },
    {
      id: "editor-banner-reload",
      label: t("editor.reload"),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      disabled: reloadDisabled,
      onSelect: onReload,
    }
  );

  appendCommonFooterItems(items, {
    t,
    idPrefix: "editor-banner",
    sepId: "sep-editor-banner-common",
    onOpenSettings,
    onClose,
  });

  return items;
}
