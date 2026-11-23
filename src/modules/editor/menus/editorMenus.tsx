import {
  Clipboard,
  ClipboardCopy,
  Copy,
  Hash,
  Lock,
  LockOpen,
  RefreshCw,
  Replace,
  RotateCw,
  Save,
  Scissors,
  Search,
  TextSelect,
  WrapText,
  X,
} from "lucide-react";
import type { ContextMenuEntry } from "@/shared/ui";

export interface BuildEditorContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  hasSelection: boolean;
  readonly: boolean;
  fileReadonly?: boolean;
  isDirty: boolean;
  saving?: boolean;
  loading?: boolean;
  connecting?: boolean;
  wordWrap?: boolean;
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
  onSave: () => void;
  onReload: () => void;
  onReconnect?: () => void;
  onCopyPath: () => void;
  onClose?: () => void;
}

export function buildEditorContextItems({
  t,
  hasSelection,
  readonly,
  fileReadonly = false,
  isDirty,
  saving = false,
  loading = false,
  connecting = false,
  wordWrap = false,
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
  onSave,
  onReload,
  onReconnect,
  onCopyPath,
  onClose,
}: BuildEditorContextItemsOpts): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [
    {
      id: "editor-cut",
      label: t("ctx.cut"),
      icon: <Scissors className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+X",
      disabled: !hasSelection || readonly,
      onSelect: onCut,
    },
    {
      id: "editor-copy",
      label: t("ctx.copy"),
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+C",
      disabled: !hasSelection,
      onSelect: onCopy,
    },
    {
      id: "editor-paste",
      label: t("ctx.paste"),
      icon: <Clipboard className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+V",
      disabled: readonly,
      onSelect: onPaste,
    },
    {
      id: "editor-select-all",
      label: t("ctx.select_all"),
      icon: <TextSelect className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+A",
      onSelect: onSelectAll,
    },
    { type: "separator", id: "sep-editor-search" },
    {
      id: "editor-find",
      label: t("ctx.find"),
      icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+F",
      onSelect: onFind,
    },
  ];

  if (onReplace) {
    items.push({
      id: "editor-replace",
      label: t("ctx.replace"),
      icon: <Replace className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+H",
      disabled: readonly,
      onSelect: onReplace,
    });
  }

  items.push({
    id: "editor-goto",
    label: t("editor.goto_line_title"),
    icon: <Hash className="h-3.5 w-3.5" />,
    shortcut: "Ctrl+G",
    onSelect: onGotoLine,
  });

  if (onToggleWordWrap || onToggleReadonly) {
    items.push({ type: "separator", id: "sep-editor-view" });
    if (onToggleWordWrap) {
      items.push({
        id: "editor-word-wrap",
        label: t("editor.word_wrap"),
        icon: <WrapText className="h-3.5 w-3.5" />,
        badge: wordWrap ? { text: t("ctx.state_on"), active: true } : undefined,
        onSelect: onToggleWordWrap,
      });
    }
    if (onToggleReadonly) {
      items.push({
        id: "editor-readonly",
        label: readonly ? t("editor.unlock_edit") : t("editor.lock_readonly"),
        icon: readonly ? (
          <Lock className="h-3.5 w-3.5 text-rose-400" />
        ) : (
          <LockOpen className="h-3.5 w-3.5" />
        ),
        disabled: fileReadonly,
        onSelect: onToggleReadonly,
      });
    }
  }

  items.push(
    { type: "separator", id: "sep-editor-file" },
    {
      id: "editor-save",
      label: t("editor.save"),
      icon: <Save className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+S",
      disabled: readonly || !isDirty || saving || (isRemote && isDisconnected),
      onSelect: onSave,
    },
    {
      id: "editor-reload",
      label: t("editor.reload"),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      disabled: loading || saving || connecting,
      onSelect: onReload,
    }
  );

  if (isRemote && onReconnect) {
    items.push({
      id: "editor-reconnect",
      label: t("common.reconnect"),
      icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: onReconnect,
    });
  }

  items.push({
    id: "editor-copy-path",
    label: t("ctx.sftp_copy_path"),
    icon: <Copy className="h-3.5 w-3.5" />,
    onSelect: onCopyPath,
  });

  if (onClose) {
    items.push(
      { type: "separator", id: "sep-editor-close" },
      {
        id: "editor-close",
        label: t("common.close"),
        icon: <X className="h-3.5 w-3.5" />,
        onSelect: onClose,
      }
    );
  }

  return items;
}

export type BuildEditorToolbarMenuOpts = BuildEditorContextItemsOpts;

export function buildEditorToolbarMenu(opts: BuildEditorToolbarMenuOpts): ContextMenuEntry[] {
  return buildEditorContextItems(opts);
}
