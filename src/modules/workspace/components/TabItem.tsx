import React, { useEffect, useRef, useState } from "react";
import {
  FileText,
  FolderSync,
  RotateCw,
  Server,
  Settings,
  X,
} from "lucide-react";
import type { SessionState, TerminalTabItem } from "@/shared/types/ipc";
import type { TabWidthMode } from "@/modules/settings";
import { useI18n } from "@/shared/i18n";
import { IconButton } from "@/shared/ui";
import { ShellIcon } from "./ShellIcon";

interface TabItemProps {
  tab: TerminalTabItem;
  isActive: boolean;
  isDragged: boolean;
  isCompact: boolean;
  tabWidthMode?: TabWidthMode;
  isRenaming?: boolean;
  closeShortcut?: string;
  sftpShortcut?: string;
  elRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onReconnect: (e: React.MouseEvent) => void;
  onToggleSftp?: (e: React.MouseEvent) => void;
  onCommitRename?: (title: string) => void;
  onCancelRename?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function getStatusIndicator(
  state: SessionState,
  t: (key: string) => string
): { dotClass: string; label: string } {
  switch (state) {
    case "CONNECTING":
    case "HANDSHAKING":
      return {
        dotClass:
          "bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.75)]",
        label: t("status.connecting"),
      };
    case "ONLINE":
      return {
        dotClass: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]",
        label: t("status.online"),
      };
    case "AUTH_FAILED":
      return {
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
        label: t("status.auth_failed"),
      };
    case "PORT_CONFLICT":
      return {
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
        label: t("status.port_conflict"),
      };
    case "DISCONNECTED":
    case "ERROR":
    default:
      return {
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
        label:
          state === "DISCONNECTED"
            ? t("status.disconnected")
            : t("status.error"),
      };
  }
}

export const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  isDragged,
  isCompact,
  tabWidthMode = "equal",
  isRenaming = false,
  closeShortcut = "Ctrl+Shift+W",
  sftpShortcut = "Ctrl+Shift+E",
  elRef,
  onPointerDown,
  onSelect,
  onClose,
  onReconnect,
  onToggleSftp,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}) => {
  const { t } = useI18n();
  const isEditor = tab.tabKind === "editor";
  const isSettings = tab.tabKind === "settings";
  const isRemoteEditor = isEditor && tab.editorFile?.kind === "remote";
  const isLocal = !isEditor && !isSettings && tab.hostId === "local";
  const displayTitle = isSettings ? t("settings.title") : tab.title;
  const [renameDraft, setRenameDraft] = useState(tab.title);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const escCancelledRef = useRef(false);

  useEffect(() => {
    if (!isRenaming) return;
    setRenameDraft(tab.title);
    escCancelledRef.current = false;
    const raf = window.requestAnimationFrame(() => {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isRenaming, tab.title]);

  const status = getStatusIndicator(tab.state, t);
  const isConnecting =
    tab.state === "CONNECTING" || tab.state === "HANDSHAKING";
  const isOffline =
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED";

  const titleText = isSettings
    ? t("settings.title")
    : isEditor
      ? isRemoteEditor
        ? `${tab.editorFile?.hostLabel ?? ""} — ${tab.editorFile?.path ?? tab.title} — ${status.label}`
        : `${tab.editorFile?.hostLabel ?? ""} — ${tab.editorFile?.path ?? tab.title}`
      : isLocal
        ? tab.isAdmin
          ? `${tab.title} (${t("app.admin_badge")})`
          : tab.title
        : tab.tabKind === "sftp"
          ? `SFTP: ${tab.title} (${tab.hostSubtitle}) — ${status.label}`
          : `${tab.title} (${tab.hostSubtitle}) — ${status.label}`;

  const isIconOnly =
    tabWidthMode === "compact" && !isActive && !isDragged && !isRenaming;
  const widthClasses = isIconOnly
    ? "w-9 min-w-[36px] max-w-[36px] shrink-0 px-0 justify-center"
    : tabWidthMode === "compact"
      ? "w-auto min-w-[136px] max-w-[230px] shrink-0 px-2.5"
      : tabWidthMode === "title_length"
        ? "w-auto min-w-[104px] max-w-[260px] shrink-0 px-2.5"
        : "w-[190px] min-w-[100px] max-w-[210px] shrink grow-0 px-2.5";

  return (
    <div
      draggable={false}
      ref={elRef}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose(e);
        }
      }}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      title={titleText}
      className={`group relative flex items-center gap-1.5 h-8 rounded-t-md text-xs font-medium cursor-pointer touch-none select-none border-t border-x ${widthClasses} ${
        isDragged
          ? "z-30 bg-[#0d1424] text-white border-sky-500/60 shadow-[0_8px_22px_rgba(0,0,0,0.75)]"
          : "transition-[background-color,color,border-color] duration-150"
      } ${
        !isDragged &&
        (isActive
          ? "bg-[#090d16] text-slate-100 border-slate-700/80 shadow-sm z-10"
          : "bg-slate-900/50 text-slate-400 border-transparent hover:bg-slate-800/70 hover:text-slate-200")
      }`}
    >
      {(isActive || isDragged) && (
        <div
          className={`absolute top-0 left-0 right-0 h-[2px] rounded-t-md ${
            tab.isAdmin ? "bg-amber-400" : "bg-sky-400"
          }`}
        />
      )}

      <span className="relative inline-flex h-4 w-4 items-center justify-center shrink-0">
        {isSettings ? (
          <Settings className="w-3.5 h-3.5 text-sky-400" />
        ) : isEditor ? (
          <FileText className="w-3.5 h-3.5 text-slate-300" />
        ) : isLocal ? (
          <ShellIcon
            profile={tab.shellProfile}
            isAdmin={Boolean(tab.isAdmin && (isCompact || isIconOnly))}
          />
        ) : tab.tabKind === "sftp" ? (
          <FolderSync className="w-3.5 h-3.5 text-sky-400" />
        ) : (
          <Server className="w-3.5 h-3.5 text-emerald-400" />
        )}
        {((!isLocal && !isEditor && !isSettings) || isRemoteEditor) && (
          <span
            title={status.label}
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-[1.5px] ${
              isActive || isDragged ? "ring-[#090d16]" : "ring-slate-900"
            } ${status.dotClass}`}
          />
        )}
        {isIconOnly && isEditor && tab.editorFile?.dirty && !isRemoteEditor && (
          <span
            title={t("editor.unsaved")}
            className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-slate-300"
          />
        )}
      </span>

      {!isIconOnly && (
        <>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              onBlur={() => {
                if (escCancelledRef.current) return;
                onCommitRename?.(renameDraft);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCommitRename?.(renameDraft);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  escCancelledRef.current = true;
                  onCancelRename?.();
                }
              }}
              className="flex-1 min-w-0 h-5 px-1.5 rounded bg-slate-950 border border-sky-500/80 text-xs font-medium text-slate-100 outline-none select-text"
            />
          ) : (
            <span className="truncate font-medium flex-1 min-w-0">{displayTitle}</span>
          )}

          {isEditor && tab.editorFile?.dirty && (
            <span
              title={t("editor.unsaved")}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
            />
          )}

          {!isEditor && !isSettings && tab.isAdmin && !isCompact && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-semibold leading-none text-amber-300 shrink-0">
              {t("app.admin_badge")}
            </span>
          )}

          {tab.tabKind === "sftp" && !isCompact && (
            <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[9px] font-semibold leading-none text-sky-300 shrink-0">
              {t("sftp.title")}
            </span>
          )}

          {!isLocal && !isEditor && !isSettings && tab.tabKind !== "sftp" && onToggleSftp && (
            <IconButton
              size="xs"
              tone="sky"
              active={tab.sftpOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSftp(e);
              }}
              title={`${t("ctx.sftp_panel")}: ${
                tab.sftpOpen ? t("ctx.state_on") : t("ctx.state_off")
              } (${sftpShortcut})`}
              icon={<FolderSync className="w-3 h-3" />}
            />
          )}

          {((!isLocal && !isEditor && !isSettings) || isRemoteEditor) && (
            <IconButton
              size="xs"
              tone={isOffline ? "rose" : "default"}
              disabled={isConnecting}
              onClick={onReconnect}
              title={isConnecting ? t("status.connecting") : t("common.reconnect")}
              icon={<RotateCw className={`w-3 h-3 ${isConnecting ? "animate-spin" : ""}`} />}
            />
          )}

          <IconButton
            size="xs"
            tone="rose"
            onClick={onClose}
            title={`${t("common.close")} (${closeShortcut})`}
            icon={<X className="w-3.5 h-3.5" />}
          />
        </>
      )}
    </div>
  );
};
