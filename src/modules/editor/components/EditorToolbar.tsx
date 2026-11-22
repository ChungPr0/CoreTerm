import React from "react";
import { Copy, Hash, Lock, LockOpen, RefreshCw, Save, Search, WrapText } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton } from "@/shared/ui";

interface EditorToolbarProps {
  hostLabel: string;
  path: string;
  editorReady: boolean;
  findOpen: boolean;
  gotoOpen: boolean;
  wordWrap: boolean;
  effectiveReadonly: boolean;
  fileReadonly: boolean;
  loading: boolean;
  saving: boolean;
  connecting: boolean;
  isDirty: boolean;
  isRemoteOffline: boolean;
  onCopyPath: () => void;
  onOpenFind: () => void;
  onOpenGoto: () => void;
  onToggleWordWrap: () => void;
  onToggleReadonly: () => void;
  onReload: () => void;
  onSave: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  hostLabel,
  path,
  editorReady,
  findOpen,
  gotoOpen,
  wordWrap,
  effectiveReadonly,
  fileReadonly,
  loading,
  saving,
  connecting,
  isDirty,
  isRemoteOffline,
  onCopyPath,
  onOpenFind,
  onOpenGoto,
  onToggleWordWrap,
  onToggleReadonly,
  onReload,
  onSave,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-3 select-none">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 rounded border border-slate-700/80 bg-slate-950 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
          {hostLabel}
        </span>

        <Button
          variant="ghost"
          size="xs"
          onClick={onCopyPath}
          title={t("ctx.sftp_copy_path")}
          rightIcon={<Copy className="h-3 w-3 opacity-60" />}
          className="min-w-0 max-w-full justify-start px-1.5 font-mono text-[11px] font-normal text-slate-400 hover:text-slate-200"
        >
          <span className="block max-w-[46vw] truncate">{path}</span>
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          size="sm"
          active={findOpen}
          disabled={!editorReady}
          onClick={onOpenFind}
          title={t("editor.find_replace")}
          icon={<Search className="h-3.5 w-3.5" />}
        />
        <IconButton
          size="sm"
          active={gotoOpen}
          disabled={!editorReady}
          onClick={onOpenGoto}
          title={t("editor.goto_line")}
          icon={<Hash className="h-3.5 w-3.5" />}
        />

        <div className="mx-1 h-4 w-px bg-slate-800" />

        <IconButton
          size="sm"
          active={wordWrap}
          disabled={!editorReady}
          onClick={onToggleWordWrap}
          title={t("editor.word_wrap")}
          icon={<WrapText className="h-3.5 w-3.5" />}
        />
        <IconButton
          size="sm"
          active={effectiveReadonly}
          disabled={!editorReady || fileReadonly}
          onClick={onToggleReadonly}
          title={effectiveReadonly ? t("editor.unlock_edit") : t("editor.lock_readonly")}
          icon={
            effectiveReadonly ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <LockOpen className="h-3.5 w-3.5" />
            )
          }
        />
        <IconButton
          size="sm"
          disabled={loading || saving || connecting}
          onClick={onReload}
          title={t("editor.reload")}
          icon={
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading || connecting ? "animate-spin" : ""}`}
            />
          }
        />

        <div className="mx-1 h-4 w-px bg-slate-800" />

        <Button
          variant="secondary"
          size="xs"
          loading={saving}
          disabled={!editorReady || effectiveReadonly || !isDirty || saving || isRemoteOffline}
          onClick={onSave}
          title={`${t("editor.save")} (Ctrl+S)`}
          leftIcon={<Save className="h-3 w-3" />}
          className={
            isDirty && !effectiveReadonly && !isRemoteOffline
              ? "border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600"
              : ""
          }
        >
          {saving ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </div>
  );
};
