import React, { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import type { SettingsCategoryId } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { useGlobalShortcuts } from "@/shared/hooks/useGlobalShortcuts";
import { useAlert, useContextMenu } from "@/shared/ui";
import { HostSidebar, useHostProfiles, type DeletePromptState, type HostFullConfigDto } from "@/modules/hosts";
import { SftpSplitContainer } from "@/modules/sftp";
import {
  resolveDefaultShell,
  TerminalViewport,
  useSshSessions,
} from "@/modules/terminal";
import { TabBar, windowApi } from "@/modules/workspace";
import { APP_PRELOADERS, AppModals } from "./AppModals";
import { useAppBootstrap } from "./useAppBootstrap";
import { useAppMenus } from "./useAppMenus";
import { useShellActions } from "./useShellActions";

const loadContextMenu = () => import("@/shared/ui/ContextMenu");
const loadSettingsTabPane = () => import("@/modules/settings/components/SettingsTabPane");
const ContextMenu = lazy(() => loadContextMenu().then((m) => ({ default: m.ContextMenu })));
const FileEditorPane = lazy(() =>
  import("@/modules/editor").then((m) => ({ default: m.FileEditorPane }))
);
const SettingsTabPane = lazy(() =>
  loadSettingsTabPane().then((m) => ({ default: m.SettingsTabPane }))
);
const PRELOADERS = [...APP_PRELOADERS, loadContextMenu, loadSettingsTabPane];

export const App: React.FC = () => {
  const { t } = useI18n();
  const alert = useAlert();
  const { menu: contextMenu, setMenu: setContextMenu, openMenu, closeMenu } = useContextMenu();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [keysVersion, setKeysVersion] = useState(0);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState<DeletePromptState | null>(null);
  const [findSignal, setFindSignal] = useState<{ tabId: string; seq: number } | null>(null);

  const focusTerminal = useCallback(() => setFocusToken((n) => n + 1), []);
  const dismissSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    focusTerminal();
  }, [focusTerminal]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((open) => {
      if (open) focusTerminal();
      return !open;
    });
  }, [focusTerminal]);

  const dismissExternalOverlaysRef = useRef<() => void>(() => {});
  const handleOpenDirectoryFromExternal = useCallback(() => {
    dismissExternalOverlaysRef.current();
    focusTerminal();
  }, [focusTerminal]);
  const handleOpenFileFromExternal = useCallback(() => {
    dismissExternalOverlaysRef.current();
  }, []);
  const handleOpenNewTabFromExternalRef = useRef<() => void>(() => {});
  const handleOpenNewTabFromExternal = useCallback(() => {
    handleOpenNewTabFromExternalRef.current();
  }, []);

  const {
    settings,
    shellProfiles,
    isShellsLoaded,
    isAppElevated,
    hasNativeBorder,
    addCustomShell,
    presentWindow,
  } = useAppBootstrap({
    preloaders: PRELOADERS,
    localHostLabel: t("sftp.local_pane"),
    onFocusTerminal: focusTerminal,
    onOpenDirectory: handleOpenDirectoryFromExternal,
    onOpenFile: handleOpenFileFromExternal,
    onOpenNewTab: handleOpenNewTabFromExternal,
  });

  const defaultShellProfile = useMemo(() => {
    if (!isShellsLoaded && settings.defaultShellProfile) {
      return settings.defaultShellProfile;
    }
    return resolveDefaultShell(shellProfiles, settings.defaultShellId);
  }, [isShellsLoaded, shellProfiles, settings.defaultShellId, settings.defaultShellProfile]);

  const hosts = useHostProfiles({ t, onError: alert.error, onRequestDelete: setDeletePrompt });

  dismissExternalOverlaysRef.current = () => {
    setIsSidebarOpen(false);
    setIsPaletteOpen(false);
    setIsVaultOpen(false);
    setDeletePrompt(null);
    closeMenu();
    hosts.setIsHostModalOpen(false);
    hosts.setIsGroupModalOpen(false);
  };

  const sessions = useSshSessions({
    isAppElevated,
    defaultShellProfile,
    allProfiles: hosts.allProfiles,
    t,
    onError: alert.error,
    onDismissSidebar: () => setIsSidebarOpen(false),
    onFocusTerminal: focusTerminal,
    onHostUpdated: () => void hosts.loadProfiles(),
  });

  handleOpenNewTabFromExternalRef.current = () => {
    dismissExternalOverlaysRef.current();
    sessions.newLocalTab();
    focusTerminal();
  };

  const openSettings = useCallback(
    (section?: SettingsCategoryId) => {
      setIsSidebarOpen(false);
      setIsPaletteOpen(false);
      closeMenu();
      sessions.openSettingsTab(section);
    },
    [closeMenu, sessions]
  );

  const hasTopLevelModal =
    hosts.isHostModalOpen ||
    isVaultOpen ||
    hosts.isGroupModalOpen ||
    !!sessions.authPrompt ||
    !!sessions.hostKeyPrompt ||
    sessions.portConflicts.length > 0 ||
    !!deletePrompt ||
    isPaletteOpen;

  const hasBlockingModal =
    hosts.isHostModalOpen ||
    isVaultOpen ||
    hosts.isGroupModalOpen ||
    !!sessions.authPrompt ||
    !!sessions.hostKeyPrompt ||
    sessions.portConflicts.length > 0 ||
    !!deletePrompt ||
    Object.values(sessions.sftpModalByTab).some(Boolean);

  const hasModalOpen = hasBlockingModal || isPaletteOpen;
  const suppressFocus =
    hasModalOpen || isSidebarOpen || !!contextMenu || !!sessions.renamingTabId;

  const triggerFindInTab = useCallback(
    (explicitTabId?: string) => {
      const targetId = explicitTabId ?? sessions.activeTabId;
      if (!targetId) return;
      const targetTab = sessions.tabs.find((item) => item.tabId === targetId);
      if (!targetTab || targetTab.tabKind === "sftp") return;
      if (targetId !== sessions.activeTabId) {
        sessions.selectTab(targetId);
      }
      setFindSignal((prev) => ({ tabId: targetId, seq: (prev?.seq ?? 0) + 1 }));
    },
    [sessions]
  );

  const closeActiveTab = useCallback(() => {
    if (sessions.activeTabId) {
      sessions.closeTabById(sessions.activeTabId);
    }
  }, [sessions]);

  const toggleActiveSftpSplit = useCallback(() => {
    const activeId = sessions.activeTabId;
    if (!activeId) return;
    const activeTab = sessions.tabs.find((item) => item.tabId === activeId);
    if (
      !activeTab ||
      activeTab.hostId === "local" ||
      activeTab.tabKind === "sftp" ||
      activeTab.tabKind === "editor" ||
      activeTab.tabKind === "settings"
    ) {
      return;
    }
    sessions.toggleSftpSplit(activeId);
  }, [sessions]);

  useGlobalShortcuts({
    hasBlockingModal,
    hasAnyModal: hasModalOpen,
    isSidebarOpen,
    hasContextMenu: !!contextMenu,
    onTogglePalette: () => setIsPaletteOpen((v) => !v),
    onNewLocalTab: sessions.newLocalTab,
    onCloseActiveTab: closeActiveTab,
    onToggleSidebar: toggleSidebar,
    onToggleSftpSplit: toggleActiveSftpSplit,
    onFindInTerminal: () => triggerFindInTab(),
    onOpenSettings: () => openSettings(),
    onToggleFullscreen: () => {
      windowApi.windowToggleFullscreen().catch(() => {});
    },
    onCloseContextMenu: closeMenu,
    onDismissSidebar: dismissSidebar,
  });

  const requestSftpDelete = useCallback(
    (opts: { title: string; message: string; onConfirm: () => Promise<void> }) => {
      setDeletePrompt({
        title: opts.title,
        itemName: opts.message,
        noteTone: "danger",
        confirmLabel: t("common.delete"),
        onConfirm: opts.onConfirm,
      });
    },
    [t]
  );

  const menus = useAppMenus({
    t,
    tabs: sessions.tabs,
    allProfiles: hosts.allProfiles,
    isAppElevated,
    shellProfiles,
    defaultShellProfile,
    setContextMenu,
    onNewLocalTab: sessions.newLocalTab,
    onRenameTab: sessions.startRenamingTab,
    onFindInTab: triggerFindInTab,
    onReconnectTab: (id) => sessions.reconnectTab(id),
    onToggleSftp: (id) => sessions.toggleSftpSplit(id),
    onOpenSftp: sessions.openSftpTab,
    onDuplicateTab: sessions.duplicateTab,
    onCloseTab: sessions.closeTabById,
    onCloseOtherTabs: sessions.closeOtherTabs,
    onConnectHost: (h) => void sessions.connectHost(h),
    onEditHost: (id) => void hosts.editHost(id),
    onDuplicateHost: (h) => void hosts.duplicateHost(h),
    onDeleteHost: hosts.requestDeleteHost,
    onNewHost: hosts.openNewHost,
    onOpenGroupModal: () => hosts.setIsGroupModalOpen(true),
    onDeleteGroup: hosts.requestDeleteGroup,
    onOpenVault: () => setIsVaultOpen(true),
    onOpenSettings: () => openSettings(),
    onOpenPalette: () => setIsPaletteOpen(true),
    onDismissSidebar: dismissSidebar,
  });

  const handleHostSaved = async (saved: HostFullConfigDto) => {
    await hosts.loadProfiles();
    sessions.syncHostConfigInTabs(saved);
  };

  const { rescanShells, pickShellForTab } = useShellActions({
    t,
    settings,
    shellProfiles,
    defaultShellProfile,
    addCustomShell,
    switchTabShell: sessions.switchTabShell,
    reconnectTab: sessions.reconnectTab,
    onError: alert.error,
  });

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-[#090d16] text-slate-100 ${
        hasNativeBorder ? "" : "border border-slate-800"
      }`}
    >
      <TabBar
        tabs={sessions.tabs}
        activeTabId={sessions.activeTabId}
        renamingTabId={sessions.renamingTabId}
        isAppElevated={isAppElevated}
        isModalOpen={hasModalOpen}
        isContextMenuOpen={!!contextMenu}
        shellProfiles={shellProfiles}
        defaultShellProfile={defaultShellProfile}
        profiles={hosts.allProfiles}
        onToggleSidebar={toggleSidebar}
        onSelectTab={sessions.selectTab}
        onBlankSpaceClick={dismissSidebar}
        onCloseTab={sessions.handleCloseTab}
        onReconnectTab={sessions.reconnectTab}
        onToggleSftp={sessions.toggleSftpSplit}
        onReorderTab={sessions.reorderTab}
        onCommitRenameTab={sessions.renameTab}
        onCancelRenameTab={sessions.cancelRenamingTab}
        onNewTab={sessions.newLocalTab}
        onRescan={() => rescanShells()}
        onConnectProfile={sessions.connectHost}
        onCreateNewHost={() => hosts.openNewHost("Default")}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onOpenSettings={openSettings}
        onContextMenuTab={menus.openTabMenu}
        onContextMenuTabBar={menus.openTabBarMenu}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {sessions.stableTabs.map((tab) => {
          const isTabActive = tab.tabId === sessions.activeTabId;
          const hostProfile =
            tab.hostId !== "local"
              ? hosts.allProfiles.find((p) => p.id === tab.hostId)
              : undefined;
          const pauseAutoReconnect =
            sessions.authPrompt?.tab_id === tab.tabId ||
            sessions.hostKeyPrompt?.tab_id === tab.tabId ||
            sessions.portConflicts.length > 0;

          if (tab.tabKind === "settings") {
            return (
              <div
                key={tab.tabId}
                style={{ display: isTabActive ? "flex" : "none" }}
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0f14]"
              >
                <Suspense fallback={null}>
                  <SettingsTabPane
                    tab={tab}
                    isActive={isTabActive}
                    shellProfiles={shellProfiles}
                    findToken={findSignal?.tabId === tab.tabId ? findSignal.seq : 0}
                    onOpenVault={() => setIsVaultOpen(true)}
                    onModalChange={sessions.handleSftpModalChange}
                  />
                </Suspense>
              </div>
            );
          }

          if (tab.tabKind === "editor" && tab.editorFile) {
            return (
              <div
                key={tab.tabId}
                style={{ display: isTabActive ? "flex" : "none" }}
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0f14]"
              >
                <Suspense fallback={null}>
                  <FileEditorPane
                    tab={tab}
                    file={tab.editorFile}
                    isActive={isTabActive}
                    hasBlockingModal={hasModalOpen}
                    hasTopLevelModal={hasTopLevelModal}
                    pauseAutoReconnect={pauseAutoReconnect}
                    findToken={findSignal?.tabId === tab.tabId ? findSignal.seq : 0}
                    closeRequestToken={sessions.editorCloseSeqByTab[tab.tabId] ?? 0}
                    onDirtyChange={(dirty) => sessions.setEditorDirty(tab.tabId, dirty)}
                    onForceClose={() => sessions.forceCloseTabById(tab.tabId)}
                    onShowMenu={openMenu}
                    onModalChange={sessions.handleSftpModalChange}
                    onSaved={() => {
                      sessions.bumpSftpRefresh(tab.hostId);
                    }}
                    onOpenSettings={() => openSettings()}
                    onOpenSshTab={
                      hostProfile ? () => void sessions.connectHost(hostProfile) : undefined
                    }
                    onOpenSftpTab={
                      hostProfile ? () => sessions.openSftpTab(hostProfile) : undefined
                    }
                  />
                </Suspense>
              </div>
            );
          }

          const terminalNode =
            tab.tabKind === "sftp" ? undefined : (
              <TerminalViewport
                key={tab.tabId}
                tab={tab}
                isActive={isTabActive}
                launchCols={settings.launchCols}
                launchRows={settings.launchRows}
                focusToken={focusToken}
                findToken={findSignal?.tabId === tab.tabId ? findSignal.seq : 0}
                suppressAutoFocus={suppressFocus}
                pauseAutoReconnect={pauseAutoReconnect}
                availableShells={shellProfiles}
                onPresentWindow={isTabActive ? presentWindow : undefined}
                onReconnect={sessions.reconnectTab}
                onSwitchShell={sessions.switchTabShell}
                onPickShell={pickShellForTab}
                onRescan={rescanShells}
                onOpenSettings={() => openSettings("shells")}
                onOpenSsh={() => setIsSidebarOpen(true)}
                onToggleAutoReconnect={sessions.toggleAutoReconnect}
                onSessionAck={sessions.handleSessionAck}
                onElevationCancelled={sessions.handleElevationCancelled}
                onContextMenuTerminal={menus.openTerminalMenu}
                onContextMenuBanner={menus.openBannerMenu}
              />
            );

          if (tab.hostId === "local" && tab.tabKind !== "sftp") {
            return terminalNode;
          }

          return (
            <SftpSplitContainer
              key={tab.tabId}
              tab={tab}
              isActive={isTabActive}
              conflictPolicy={settings.sftpConflictPolicy}
              pauseAutoReconnect={pauseAutoReconnect}
              terminal={terminalNode}
              onStartSplitResize={sessions.startSplitResize}
              onToggleSftpSplit={sessions.toggleSftpSplit}
              onOpenInTerminal={sessions.openSftpInTerminal}
              onShowMenu={openMenu}
              onConfirmDelete={requestSftpDelete}
              onModalChange={sessions.handleSftpModalChange}
              onSftpState={sessions.handleSftpState}
              onToggleAutoReconnect={sessions.toggleAutoReconnect}
              onOpenSftpTab={
                hostProfile ? () => sessions.openSftpTab(hostProfile) : undefined
              }
              onOpenSshTab={
                hostProfile ? () => void sessions.connectHost(hostProfile) : undefined
              }
              onOpenSettings={() => openSettings()}
              onCloseTab={sessions.closeTabById}
            />
          );
        })}

        <HostSidebar
          isOpen={isSidebarOpen}
          onClose={dismissSidebar}
          profiles={hosts.filteredProfiles}
          groups={hosts.dbGroups}
          isFiltering={Boolean(hosts.searchQuery.trim() || hosts.selectedTag)}
          allTags={hosts.allTags}
          selectedTag={hosts.selectedTag}
          onSelectTag={hosts.setSelectedTag}
          searchQuery={hosts.searchQuery}
          onSearchChange={hosts.setSearchQuery}
          onConnectHost={sessions.connectHost}
          onOpenSftp={sessions.openSftpTab}
          onCreateNew={() => hosts.openNewHost("Default")}
          onOpenVault={() => setIsVaultOpen(true)}
          onOpenSettings={() => openSettings()}
          onEditHost={hosts.editHost}
          onDuplicateHost={hosts.duplicateHost}
          onDeleteHost={hosts.requestDeleteHost}
          onMoveHostToGroup={hosts.moveHostToGroup}
          onReorderGroups={hosts.reorderGroups}
          onContextMenuHost={menus.openHostMenu}
          onContextMenuGroup={menus.openGroupMenu}
          onContextMenuSidebar={menus.openSidebarMenu}
        />

        <AppModals
          allProfiles={hosts.allProfiles}
          dbGroups={hosts.dbGroups}
          existingGroups={hosts.existingGroups}
          isHostModalOpen={hosts.isHostModalOpen}
          editingHost={hosts.editingHost}
          hostInitialGroup={hosts.hostInitialGroup}
          isGroupModalOpen={hosts.isGroupModalOpen}
          isCreatingGroup={hosts.isCreatingGroup}
          onCloseHostModal={() => hosts.setIsHostModalOpen(false)}
          onCloseGroupModal={() => hosts.setIsGroupModalOpen(false)}
          onCreateGroup={hosts.createGroup}
          onHostSaved={handleHostSaved}
          onKeysChanged={() => {
            setKeysVersion((v) => v + 1);
            void hosts.loadProfiles();
          }}
          isVaultOpen={isVaultOpen}
          keysVersion={keysVersion}
          onOpenVault={() => setIsVaultOpen(true)}
          onCloseVault={() => setIsVaultOpen(false)}
          isAppElevated={isAppElevated}
          shellProfiles={shellProfiles}
          isPaletteOpen={isPaletteOpen}
          onClosePalette={() => setIsPaletteOpen(false)}
          onSelectHost={sessions.connectHost}
          onSelectShell={(profile, asAdmin) =>
            sessions.newLocalTab({
              profile,
              asAdmin: typeof asAdmin === "boolean" ? asAdmin : isAppElevated,
            })
          }
          onOpenSftpTab={sessions.openSftpTab}
          onOpenSettings={() => openSettings()}
          authPrompt={sessions.authPrompt}
          authPromptSource={sessions.authPromptSource}
          hostKeyPrompt={sessions.hostKeyPrompt}
          hostKeySource={sessions.hostKeySource}
          onCloseAuthPrompt={sessions.dismissAuthPrompt}
          onCloseHostKeyPrompt={sessions.dismissHostKeyPrompt}
          onAbortAuthTab={sessions.abortAuthTab}
          onReconnectTab={sessions.reconnectTab}
          onCancelAutoReconnect={(tabId) => sessions.toggleAutoReconnect(tabId, false)}
          portConflicts={sessions.portConflicts}
          onSkipPortConflicts={sessions.skipPortConflictsAndConnect}
          onAbortPortConflicts={sessions.abortPortConflicts}
          deletePrompt={deletePrompt}
          onClearDeletePrompt={() => setDeletePrompt(null)}
        />
      </div>

      {contextMenu && (
        <Suspense fallback={null}>
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={closeMenu}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
