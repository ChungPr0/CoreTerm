import React, { useLayoutEffect, useMemo, useRef } from "react";
import {
  ChevronRight,
  Copy,
  Hash,
  Lock,
  LockOpen,
  RefreshCw,
  Save,
  Search,
  WrapText,
} from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { IconButton } from "@/shared/ui";
import { splitLocalCrumbs, splitRemoteCrumbs } from "@/shared/utils/path";

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
  retrying?: boolean;
  saving: boolean;
  connecting: boolean;
  isDirty: boolean;
  isRemoteOffline: boolean;
  isRemote?: boolean;
  isRemoteConnecting?: boolean;
  onCopyPath: () => void;
  onOpenFind: () => void;
  onOpenGoto: () => void;
  onToggleWordWrap: () => void;
  onToggleReadonly: () => void;
  onReload: () => void;
  onSave: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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
  retrying = false,
  saving,
  connecting,
  isDirty,
  isRemoteOffline,
  isRemote = false,
  isRemoteConnecting = false,
  onCopyPath,
  onOpenFind,
  onOpenGoto,
  onToggleWordWrap,
  onToggleReadonly,
  onReload,
  onSave,
  onContextMenu,
}) => {
  const { t } = useI18n();
  const crumbsRef = useRef<HTMLDivElement>(null);

  const crumbs = useMemo(
    () => (isRemote ? splitRemoteCrumbs(path) : splitLocalCrumbs(path)),
    [isRemote, path]
  );

  useLayoutEffect(() => {
    if (crumbsRef.current) {
      crumbsRef.current.scrollLeft = crumbsRef.current.scrollWidth;
    }
  }, [path, isRemote]);

  const statusMeta = useMemo(() => {
    if (!isRemote) {
      return {
        dot: "bg-sky-400",
        text: "text-sky-300",
        label: "",
      };
    }
    if (isRemoteOffline) {
      return {
        dot: "bg-rose-400",
        text: "text-rose-300",
        label: t("sftp.disconnected"),
      };
    }
    if (isRemoteConnecting || connecting) {
      return {
        dot: "bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.7)]",
        text: "text-sky-300",
        label: t("sftp.connecting"),
      };
    }
    return {
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      label: t("sftp.connected"),
    };
  }, [connecting, isRemote, isRemoteConnecting, isRemoteOffline, t]);

  return (
    <div
      onContextMenu={onContextMenu}
      className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[#21262d] bg-[#161b22] px-3 select-none"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div
          className="flex min-w-0 max-w-[200px] shrink items-center gap-2 text-xs"
          data-tooltip={`${t("editor.title")} — ${hostLabel}`}
          data-tooltip-placement="bottom"
        >
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${statusMeta.dot}`}
            data-tooltip={statusMeta.label || hostLabel}
            data-tooltip-placement="bottom"
          />
          <span className="truncate font-semibold text-[#e6edf3]">
            {t("editor.title")} — {hostLabel}
          </span>
        </div>

        <div
          ref={crumbsRef}
          data-tooltip={path}
          data-tooltip-placement="bottom"
          className="no-scrollbar flex h-6 min-w-0 flex-1 cursor-default items-center gap-0.5 overflow-x-auto rounded border border-[#21262d] bg-[#0d1117] px-2 font-mono text-[11px] text-[#c9d1d9]"
        >
          {crumbs.map((c, idx) => (
            <React.Fragment key={c.path}>
              {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[#484f58]" />}
              <span
                className={`shrink-0 whitespace-nowrap px-0.5 ${
                  idx === crumbs.length - 1 ? "font-semibold text-[#e6edf3]" : "text-[#8b949e]"
                }`}
              >
                {c.label}
              </span>
            </React.Fragment>
          ))}
        </div>

        <IconButton
          size="sm"
          onClick={onCopyPath}
          title={t("ctx.sftp_copy_path")}
          icon={<Copy className="h-3.5 w-3.5" />}
        />
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

        <div className="mx-1 h-4 w-px bg-[#21262d]" />

        <IconButton
          size="sm"
          active={wordWrap}
          disabled={!editorReady}
          onClick={onToggleWordWrap}
          title={t("editor.word_wrap")}
          icon={<WrapText className="h-3.5 w-3.5" />}
        />
        <div
          data-tooltip={
            fileReadonly
              ? t("editor.lock_readonly_file")
              : effectiveReadonly
                ? t("editor.unlock_edit")
                : t("editor.lock_readonly")
          }
          data-tooltip-placement="bottom"
          className="inline-flex items-center"
        >
          <IconButton
            size="sm"
            tone={effectiveReadonly ? "rose" : "default"}
            active={effectiveReadonly}
            disabled={!editorReady || fileReadonly}
            onClick={onToggleReadonly}
            className={
              fileReadonly
                ? "border-rose-500/50 bg-rose-500/15 text-rose-400 opacity-100 cursor-not-allowed hover:bg-rose-500/15 hover:text-rose-400"
                : effectiveReadonly
                  ? "border-rose-500/50 bg-rose-500/15 text-rose-400"
                  : ""
            }
            icon={
              effectiveReadonly ? (
                <Lock className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <LockOpen className="h-3.5 w-3.5" />
              )
            }
          />
        </div>
        <IconButton
          size="sm"
          disabled={loading || retrying || saving || connecting}
          onClick={onReload}
          title={t("editor.reload")}
          icon={
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading || retrying || connecting ? "animate-spin" : ""}`}
            />
          }
        />

        <div className="mx-1 h-4 w-px bg-[#21262d]" />

        <IconButton
          size="sm"
          disabled={!editorReady || effectiveReadonly || !isDirty || saving || isRemoteOffline}
          onClick={onSave}
          title={`${t("editor.save")} (Ctrl+S)`}
          className={
            isDirty && !effectiveReadonly && !isRemoteOffline
              ? "text-slate-100 hover:text-white"
              : ""
          }
          icon={
            saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )
          }
        />
      </div>
    </div>
  );
};
