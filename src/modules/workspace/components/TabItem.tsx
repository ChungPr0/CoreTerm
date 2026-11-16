import React, { useEffect, useRef, useState } from "react";
import {
  FolderSync,
  RotateCw,
  Server,
  X,
} from "lucide-react";
import type { SessionState, TerminalTabItem } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { ShellIcon } from "./ShellIcon";

interface TabItemProps {
  tab: TerminalTabItem;
  isActive: boolean;
  isDragged: boolean;
  isCompact: boolean;
  isRenaming?: boolean;
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
          "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]",
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
  isRenaming = false,
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
  const isLocal = tab.hostId === "local";
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
  const isOffline =
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED";

  const titleText = isLocal
    ? tab.isAdmin
      ? `${tab.title} (${t("app.admin_badge")})`
      : tab.title
    : tab.tabKind === "sftp"
      ? `SFTP: ${tab.title} (${tab.hostSubtitle}) — ${status.label}`
      : `${tab.title} (${tab.hostSubtitle}) — ${status.label}`;

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
      className={`group relative flex items-center gap-1.5 px-2.5 h-8 rounded-t-md text-xs font-medium cursor-pointer touch-none select-none w-[190px] min-w-[100px] max-w-[210px] shrink grow-0 border-t border-x ${
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
        {isLocal ? (
          <ShellIcon
            profile={tab.shellProfile}
            isAdmin={Boolean(tab.isAdmin && isCompact)}
          />
        ) : tab.tabKind === "sftp" ? (
          <FolderSync className="w-3.5 h-3.5 text-sky-400" />
        ) : (
          <Server className="w-3.5 h-3.5 text-emerald-400" />
        )}
        {!isLocal && (
          <span
            title={status.label}
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-[1.5px] ${
              isActive || isDragged ? "ring-[#090d16]" : "ring-slate-900"
            } ${status.dotClass}`}
          />
        )}
      </span>

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
        <span className="truncate font-medium flex-1 min-w-0">{tab.title}</span>
      )}

      {tab.isAdmin && !isCompact && (
        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-semibold leading-none text-amber-300 shrink-0">
          {t("app.admin_badge")}
        </span>
      )}

      {tab.tabKind === "sftp" && !isCompact && (
        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[9px] font-semibold leading-none text-sky-300 shrink-0">
          SFTP
        </span>
      )}

      {!isLocal && tab.tabKind !== "sftp" && onToggleSftp && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSftp(e);
          }}
          title={`${t("ctx.sftp_panel")}: ${
            tab.sftpOpen ? t("ctx.state_on") : t("ctx.state_off")
          }`}
          className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors shrink-0 ${
            tab.sftpOpen
              ? "bg-sky-500/20 text-sky-300"
              : "text-slate-400 hover:bg-slate-700/70 hover:text-sky-300"
          }`}
        >
          <FolderSync className="w-3 h-3" />
        </button>
      )}

      {!isLocal && (
        <button
          type="button"
          onClick={onReconnect}
          title={t("common.reconnect")}
          className={`inline-flex h-5 w-5 items-center justify-center rounded hover:bg-slate-700/70 transition-colors shrink-0 ${
            isOffline
              ? "text-sky-400 hover:text-sky-300"
              : "text-slate-400 hover:text-sky-300"
          }`}
        >
          <RotateCw className="w-3 h-3" />
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        title={t("common.close")}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
