import {
  Clipboard,
  ClipboardCopy,
  Copy,
  Hash,
  RefreshCw,
  RotateCw,
  Save,
  Scissors,
  Search,
  TextSelect,
} from "lucide-react";
import type { ContextMenuEntry } from "@/shared/ui";

interface BuildEditorContextItemsOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  hasSelection: boolean;
  readonly: boolean;
  isDirty: boolean;
  isRemote: boolean;
  isDisconnected: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onFind: () => void;
  onGotoLine: () => void;
  onSave: () => void;
  onReload: () => void;
  onReconnect?: () => void;
  onCopyPath: () => void;
}

export function buildEditorContextItems({
  t,
  hasSelection,
  readonly,
  isDirty,
  isRemote,
  isDisconnected,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onFind,
  onGotoLine,
  onSave,
  onReload,
  onReconnect,
  onCopyPath,
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
    { type: "separator", id: "sep-editor-nav" },
    {
      id: "editor-find",
      label: t("ctx.find"),
      icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
      shortcut: "Ctrl+F",
      onSelect: onFind,
    },
    {
      id: "editor-goto",
      label: t("editor.goto_line_title"),
      icon: <Hash className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+G",
      onSelect: onGotoLine,
    },
    { type: "separator", id: "sep-editor-file" },
    {
      id: "editor-save",
      label: t("editor.save"),
      icon: <Save className="h-3.5 w-3.5" />,
      shortcut: "Ctrl+S",
      disabled: readonly || !isDirty || (isRemote && isDisconnected),
      onSelect: onSave,
    },
    {
      id: "editor-reload",
      label: t("editor.reload"),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onSelect: onReload,
    },
  ];

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

  return items;
}
