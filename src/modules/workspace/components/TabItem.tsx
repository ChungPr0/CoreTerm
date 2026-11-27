import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderSync,
  RotateCw,
  Server,
  Settings,
  X,
} from "lucide-react";
import { LOCAL_HOST_ID } from "@/shared/defaults";
import type { TerminalTabItem } from "@/shared/types/ipc";
import type { TabWidthMode } from "@/modules/settings";
import { useI18n } from "@/shared/i18n";
import { IconButton, useTooltipSlot } from "@/shared/ui";
import { DEFAULT_KEYBINDINGS } from "@/shared/utils/shortcuts";
import { isTabConnecting, isTabOffline } from "../utils/tabHelpers";
import { ShellIcon } from "./ShellIcon";
import {
  TabHostTooltipCard,
  formatTabTooltipTitle,
  getTabStatusIndicator,
} from "./TabHostTooltipCard";

interface TabItemProps {
  tab: TerminalTabItem;
  isActive: boolean;
  isDragged: boolean;
  isCompact: boolean;
  tabWidthMode?: TabWidthMode;
  isRenaming?: boolean;
  suppressTooltip?: boolean;
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

export const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  isDragged,
  isCompact,
  tabWidthMode = "equal",
  isRenaming = false,
  suppressTooltip = false,
  closeShortcut = DEFAULT_KEYBINDINGS.closeTab,
  sftpShortcut = DEFAULT_KEYBINDINGS.toggleSftpPanel,
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
  const isLocal = !isEditor && !isSettings && tab.hostId === LOCAL_HOST_ID;
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

  const status = getTabStatusIndicator(tab.state, t);
  const isConnecting = isTabConnecting(tab);
  const isOffline = isTabOffline(tab);
  const titleText = formatTabTooltipTitle(tab, status.label, t);

  const isRemoteHostTab = !isEditor && !isSettings && !isLocal;
  const disableTip = isDragged || isRenaming || suppressTooltip;
  const forwardCount = tab.activeForwards?.length ?? 0;

  const remoteHostCard = useMemo(() => {
    if (!isRemoteHostTab) return null;
    return (
      <TabHostTooltipCard
        title={displayTitle}
        hostSubtitle={tab.hostSubtitle}
        isSftpTab={tab.tabKind === "sftp"}
        sftpSplitOpen={Boolean(tab.sftpOpen)}
        forwardCount={forwardCount}
        status={status}
        t={t}
      />
    );
  }, [
    isRemoteHostTab,
    displayTitle,
    tab.hostSubtitle,
    tab.tabKind,
    tab.sftpOpen,
    forwardCount,
    status.dotClass,
    status.textClass,
    status.label,
    t,
  ]);

  const cardSlotProps = useTooltipSlot(remoteHostCard, {
    placement: "bottom",
    variant: "card",
    disabled: !isRemoteHostTab || disableTip,
  });

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
      {...cardSlotProps}
      data-tooltip={!isRemoteHostTab && !disableTip ? titleText : undefined}
      data-tooltip-placement="bottom"
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
            data-tooltip={isRemoteEditor ? status.label : undefined}
            data-tooltip-placement="bottom"
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-[1.5px] ${
              isActive || isDragged ? "ring-[#090d16]" : "ring-slate-900"
            } ${status.dotClass}`}
          />
        )}
        {isIconOnly && isEditor && tab.editorFile?.dirty && !isRemoteEditor && (
          <span
            data-tooltip={t("editor.unsaved")}
            data-tooltip-placement="bottom"
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
              data-tooltip={t("editor.unsaved")}
              data-tooltip-placement="bottom"
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
              data-tooltip-placement="bottom"
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
              data-tooltip-placement="bottom"
              icon={<RotateCw className={`w-3 h-3 ${isConnecting ? "animate-spin" : ""}`} />}
            />
          )}

          <IconButton
            size="xs"
            tone="rose"
            onClick={onClose}
            title={`${t("common.close")} (${closeShortcut})`}
            data-tooltip-placement="bottom"
            icon={<X className="w-3.5 h-3.5" />}
          />
        </>
      )}
    </div>
  );
};
