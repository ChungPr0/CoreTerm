import React, { useEffect, useRef, useState } from "react";
import { ArrowUpCircle, Menu, RefreshCw, Shield } from "lucide-react";
import type {
  SettingsCategoryId,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import type { KeybindingOverrides, TabWidthMode } from "@/modules/settings";
import { useUpdaterStore } from "@/modules/updater";
import { useI18n } from "@/shared/i18n";
import { IconButton } from "@/shared/ui";
import { getEditableInput } from "@/shared/utils/editableTarget";
import { getShortcutChord } from "@/shared/utils/shortcuts";
import { useTabDrag } from "../hooks/useTabDrag";
import { NewTabDropdown } from "./NewTabDropdown";
import { TabItem } from "./TabItem";
import { WindowCaptionControls } from "./WindowCaptionControls";

interface TabBarProps {
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  renamingTabId?: string | null;
  isAppElevated: boolean;
  isFullscreen?: boolean;
  isMaximized?: boolean;
  showAdminShield?: boolean;
  tabWidthMode?: TabWidthMode;
  keybindings?: KeybindingOverrides;
  isModalOpen?: boolean;
  isContextMenuOpen?: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  profiles: HostProfileSummaryDto[];
  onToggleSidebar: () => void;
  onSelectTab: (tabId: string) => void;
  onBlankSpaceClick?: () => void;
  onCloseTab: (tabId: string, e: React.MouseEvent) => void;
  onReconnectTab: (tabId: string, e: React.MouseEvent) => void;
  onToggleSftp?: (tabId: string, e: React.MouseEvent) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onCommitRenameTab?: (tabId: string, title: string) => void;
  onCancelRenameTab?: () => void;
  onNewTab: (opts?: { profile?: ShellProfile; asAdmin?: boolean }) => void;
  onRescan?: () => Promise<void> | void;
  onConnectProfile: (host: HostProfileSummaryDto) => void;
  onCreateNewHost: () => void;
  onOpenPalette: () => void;
  onOpenSettings: (section?: SettingsCategoryId) => void;
  onToggleMaximize?: () => void;
  onExitFullscreen?: () => void;
  onCloseWindow?: () => void;
  onContextMenuTab: (e: React.MouseEvent, tab: TerminalTabItem) => void;
  onContextMenuTabBar?: (e: React.MouseEvent) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  renamingTabId = null,
  isAppElevated,
  isFullscreen = false,
  isMaximized = false,
  showAdminShield = true,
  tabWidthMode = "equal",
  keybindings,
  isModalOpen = false,
  isContextMenuOpen = false,
  shellProfiles,
  defaultShellProfile,
  profiles,
  onToggleSidebar,
  onSelectTab,
  onBlankSpaceClick,
  onCloseTab,
  onReconnectTab,
  onToggleSftp,
  onReorderTab,
  onCommitRenameTab,
  onCancelRenameTab,
  onNewTab,
  onRescan,
  onConnectProfile,
  onCreateNewHost,
  onOpenPalette,
  onOpenSettings,
  onToggleMaximize,
  onExitFullscreen,
  onCloseWindow,
  onContextMenuTab,
  onContextMenuTabBar,
}) => {
  const { t } = useI18n();
  const [middleWidth, setMiddleWidth] = useState<number>(900);
  const middleRef = useRef<HTMLDivElement | null>(null);
  const updatePhase = useUpdaterStore((s) => s.phase);
  const latestUpdate = useUpdaterStore((s) => s.latest);
  const updateProgress = useUpdaterStore((s) => s.progress);
  const openUpdateModal = useUpdaterStore((s) => s.openModal);

  const {
    draggingTabId,
    stripRef,
    tabElsRef,
    suppressClickRef,
    handleTabPointerDown,
    handleStripWheel,
  } = useTabDrag({ tabs, onSelectTab, onReorderTab });

  const isCompactTabs =
    tabWidthMode === "equal" &&
    tabs.length > 0 &&
    (middleWidth - 104) / tabs.length < 132;
  const sidebarShortcut = getShortcutChord("toggleSidebar", keybindings);
  const closeShortcut = getShortcutChord("closeTab", keybindings);
  const sftpShortcut = getShortcutChord("toggleSftpPanel", keybindings);

  useEffect(() => {
    const el = middleRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const updateWidth = () => setMiddleWidth(el.clientWidth);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!activeTabId || draggingTabId) return;
    const el = tabElsRef.current.get(activeTabId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId, draggingTabId, tabs.length, tabElsRef]);

  return (
    <div
      data-tauri-drag-region={!isFullscreen && isModalOpen ? "deep" : undefined}
      onContextMenu={(e) => {
        if (getEditableInput(e.target)) return;
        if (isModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!onContextMenuTabBar) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenuTabBar(e);
      }}
      className="h-9 bg-slate-950 border-b border-slate-800/80 flex items-center select-none shrink-0 relative z-[80]"
    >
      <IconButton
        size="md"
        disabled={isModalOpen}
        onClick={onToggleSidebar}
        title={`${t("app.menu")} (${sidebarShortcut})`}
        data-tooltip-placement="bottom"
        icon={<Menu className="w-4 h-4" />}
        className="ml-1.5 mr-1 shrink-0"
      />

      <div
        ref={middleRef}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isModalOpen) onBlankSpaceClick?.();
        }}
        className="flex items-center flex-1 min-w-0 h-full gap-1"
      >
        <div
          ref={stripRef}
          onWheel={handleStripWheel}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isModalOpen) onBlankSpaceClick?.();
          }}
          className={`flex items-end flex-initial min-w-0 max-w-full gap-1 h-full overflow-x-auto no-scrollbar transition-opacity ${
            isModalOpen ? "opacity-45 pointer-events-none" : ""
          }`}
        >
          {tabs.map((tab) => (
            <TabItem
              key={tab.tabId}
              tab={tab}
              isActive={tab.tabId === activeTabId}
              isDragged={tab.tabId === draggingTabId}
              isCompact={isCompactTabs}
              tabWidthMode={tabWidthMode}
              isRenaming={tab.tabId === renamingTabId}
              suppressTooltip={isModalOpen || isContextMenuOpen}
              closeShortcut={closeShortcut}
              sftpShortcut={sftpShortcut}
              elRef={(el) => {
                if (el) tabElsRef.current.set(tab.tabId, el);
                else tabElsRef.current.delete(tab.tabId);
              }}
              onPointerDown={(e) => handleTabPointerDown(e, tab.tabId)}
              onSelect={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onSelectTab(tab.tabId);
              }}
              onClose={(e) => onCloseTab(tab.tabId, e)}
              onReconnect={(e) => onReconnectTab(tab.tabId, e)}
              onToggleSftp={
                onToggleSftp ? (e) => onToggleSftp(tab.tabId, e) : undefined
              }
              onCommitRename={(title) => onCommitRenameTab?.(tab.tabId, title)}
              onCancelRename={onCancelRenameTab}
              onContextMenu={(e) => onContextMenuTab(e, tab)}
            />
          ))}
        </div>

        <NewTabDropdown
          isAppElevated={isAppElevated}
          isModalOpen={isModalOpen}
          isContextMenuOpen={isContextMenuOpen}
          shellProfiles={shellProfiles}
          defaultShellProfile={defaultShellProfile}
          profiles={profiles}
          onNewTab={onNewTab}
          onRescan={onRescan}
          onConnectProfile={onConnectProfile}
          onCreateNewHost={onCreateNewHost}
          onOpenPalette={onOpenPalette}
          onOpenSettings={onOpenSettings}
        />

        <div
          data-tauri-drag-region={!isFullscreen ? true : undefined}
          onClick={() => {
            if (!isModalOpen) onBlankSpaceClick?.();
          }}
          className="flex-1 h-full min-w-[44px]"
        />
      </div>

      {(updatePhase === "available" ||
        updatePhase === "downloading" ||
        updatePhase === "ready") &&
        latestUpdate?.version && (
          <button
            type="button"
            tabIndex={-1}
            disabled={isModalOpen}
            onClick={openUpdateModal}
            data-tooltip={
              updatePhase === "downloading"
                ? t("updater.badge_downloading", {
                    percent: updateProgress?.percent ?? 0,
                  })
                : updatePhase === "ready"
                  ? t("updater.badge_ready", { version: latestUpdate.version })
                  : t("updater.badge_available", {
                      version: latestUpdate.version,
                    })
            }
            data-tooltip-placement="bottom"
            className={`mr-2 px-2 py-0.5 rounded-md border flex items-center gap-1 text-[10px] font-semibold shrink-0 transition-colors cursor-pointer disabled:opacity-45 disabled:pointer-events-none ${
              updatePhase === "ready"
                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25"
                : "bg-sky-500/15 border-sky-500/35 text-sky-300 hover:bg-sky-500/25"
            }`}
          >
            {updatePhase === "downloading" ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{`${updateProgress?.percent ?? 0}%`}</span>
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-3 h-3" />
                <span>{`v${latestUpdate.version}`}</span>
              </>
            )}
          </button>
        )}

      {isAppElevated && showAdminShield && (
        <div
          data-tauri-drag-region={!isFullscreen ? "deep" : undefined}
          className="mr-2 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 flex items-center gap-1 text-[10px] font-semibold text-amber-300 shrink-0"
        >
          <Shield className="w-3 h-3" />
          <span>{t("app.admin_badge")}</span>
        </div>
      )}

      <WindowCaptionControls
        isFullscreen={isFullscreen}
        isMaximized={isMaximized}
        onToggleMaximize={onToggleMaximize}
        onExitFullscreen={onExitFullscreen}
        onCloseWindow={onCloseWindow}
      />
    </div>
  );
};
