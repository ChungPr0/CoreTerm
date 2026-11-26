import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { planWindowClose, TabBar, useTabsStore, windowApi } from "@/modules/workspace";
import { APP_PRELOADERS, AppModals, type CloseTabsPromptState } from "./AppModals";
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenBarPeek, setFullscreenBarPeek] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState<DeletePromptState | null>(null);
  const [closeTabsPrompt, setCloseTabsPrompt] = useState<CloseTabsPromptState | null>(
    null
  );
  const [findSignal, setFindSignal] = useState<{ tabId: string; seq: number } | null>(null);
  const pendingWindowCloseRef = useRef(false);

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
  const requestCloseWindowRef = useRef<() => void>(() => {});
  const handleRequestCloseWindow = useCallback(() => {
    requestCloseWindowRef.current();
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
    onRequestCloseWindow: handleRequestCloseWindow,
  });

  const defaultShellProfile = useMemo(() => {
    if (!isShellsLoaded && settings.defaultShellProfile) {
      return settings.defaultShellProfile;
    }
    return resolveDefaultShell(shellProfiles, settings.defaultShellId);
  }, [isShellsLoaded, shellProfiles, settings.defaultShellId, settings.defaultShellProfile]);

  const hosts = useHostProfiles({ t, onError: alert.error, onRequestDelete: setDeletePrompt });

  dismissExternalOverlaysRef.current = () => {
    pendingWindowCloseRef.current = false;
    setIsSidebarOpen(false);
    setIsPaletteOpen(false);
    setIsVaultOpen(false);
    setDeletePrompt(null);
    setCloseTabsPrompt(null);
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

  const requestCloseWindow = useCallback(() => {
    const decision = planWindowClose(
      useTabsStore.getState().tabs,
      settings.warnCloseMultiTabs
    );
    if (decision.action === "close_now") {
      pendingWindowCloseRef.current = false;
      windowApi.windowClose().catch(() => {});
      return;
    }
    pendingWindowCloseRef.current = true;
    setIsSidebarOpen(false);
    setIsPaletteOpen(false);
    closeMenu();
    windowApi.windowRestoreFocus().catch(() => {});
    if (decision.action === "prompt_dirty_editor") {
      setCloseTabsPrompt(null);
      useTabsStore.getState().requestEditorClose(decision.tabId);
      return;
    }
    setCloseTabsPrompt({ mode: "window", count: decision.count });
  }, [closeMenu, settings.warnCloseMultiTabs]);
  requestCloseWindowRef.current = requestCloseWindow;

  const cancelPendingWindowClose = useCallback(() => {
    pendingWindowCloseRef.current = false;
  }, []);

  const handleEditorForceClose = useCallback(
    (tabId: string) => {
      if (!pendingWindowCloseRef.current) {
        sessions.forceCloseTabById(tabId);
        return;
      }
      sessions.closeTabForWindowExit(tabId);
      const nextDecision = planWindowClose(
        useTabsStore.getState().tabs,
        settings.warnCloseMultiTabs
      );
      if (nextDecision.action === "prompt_dirty_editor") {
        useTabsStore.getState().requestEditorClose(nextDecision.tabId);
        return;
      }
      if (nextDecision.action === "prompt_multi_tabs") {
        setCloseTabsPrompt({ mode: "window", count: nextDecision.count });
        return;
      }
      pendingWindowCloseRef.current = false;
      windowApi.windowClose().catch(() => {});
    },
    [sessions, settings.warnCloseMultiTabs]
  );

  const requestCloseOtherTabs = useCallback(
    (keepTabId: string) => {
      const otherCount = useTabsStore
        .getState()
        .tabs.filter((item) => item.tabId !== keepTabId).length;
      if (settings.warnCloseMultiTabs && otherCount > 1) {
        closeMenu();
        setCloseTabsPrompt({ mode: "others", keepTabId, count: otherCount });
        return;
      }
      sessions.closeOtherTabs(keepTabId);
    },
    [closeMenu, sessions, settings.warnCloseMultiTabs]
  );

  const confirmCloseTabsPrompt = useCallback(() => {
    if (!closeTabsPrompt) return;
    const prompt = closeTabsPrompt;
    setCloseTabsPrompt(null);
    if (prompt.mode === "window") {
      pendingWindowCloseRef.current = false;
      windowApi.windowClose().catch(() => {});
    } else {
      sessions.closeOtherTabs(prompt.keepTabId);
    }
  }, [closeTabsPrompt, sessions]);

  const hasTopLevelModal =
    hosts.isHostModalOpen ||
    isVaultOpen ||
    hosts.isGroupModalOpen ||
    !!sessions.authPrompt ||
    !!sessions.hostKeyPrompt ||
    sessions.portConflicts.length > 0 ||
    !!deletePrompt ||
    !!closeTabsPrompt ||
    isPaletteOpen;

  const hasBlockingModal =
    hosts.isHostModalOpen ||
    isVaultOpen ||
    hosts.isGroupModalOpen ||
    !!sessions.authPrompt ||
    !!sessions.hostKeyPrompt ||
    sessions.portConflicts.length > 0 ||
    !!deletePrompt ||
    !!closeTabsPrompt ||
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

  const duplicateActiveTab = useCallback(() => {
    if (!sessions.activeTabId) return;
    const activeTab = sessions.tabs.find((item) => item.tabId === sessions.activeTabId);
    if (activeTab) {
      sessions.duplicateTab(activeTab);
    }
  }, [sessions]);

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      const list = sessions.tabs;
      if (list.length <= 1) return;
      const curIdx = list.findIndex((item) => item.tabId === sessions.activeTabId);
      const baseIdx = curIdx >= 0 ? curIdx : 0;
      const nextIdx = (baseIdx + delta + list.length) % list.length;
      sessions.selectTab(list[nextIdx].tabId);
    },
    [sessions]
  );

  const toggleFullscreen = useCallback(() => {
    windowApi
      .windowToggleFullscreen()
      .then((fs) => {
        setIsFullscreen(fs);
        if (!fs) setFullscreenBarPeek(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isFullscreen || settings.showTabsInFullscreen) {
      setFullscreenBarPeek(false);
    }
  }, [isFullscreen, settings.showTabsInFullscreen]);

  useEffect(() => {
    let active = true;
    const syncFullscreen = () => {
      windowApi
        .windowIsFullscreen()
        .then((fs) => {
          if (active) setIsFullscreen(fs);
        })
        .catch(() => {});
    };
    syncFullscreen();
    window.addEventListener("resize", syncFullscreen);
    return () => {
      active = false;
      window.removeEventListener("resize", syncFullscreen);
    };
  }, []);

  const activeWindowTitle = useMemo(() => {
    if (!settings.useActiveTabTitle) return "CoreTerm";
    const activeTab = sessions.tabs.find((item) => item.tabId === sessions.activeTabId);
    if (!activeTab) return "CoreTerm";
    const label =
      activeTab.tabKind === "settings"
        ? t("settings.title")
        : activeTab.tabKind === "sftp"
          ? `SFTP: ${activeTab.title}`
          : activeTab.title;
    return label ? `${label} — CoreTerm` : "CoreTerm";
  }, [sessions.activeTabId, sessions.tabs, settings.useActiveTabTitle, t]);

  useEffect(() => {
    document.title = activeWindowTitle;
    windowApi.windowSetTitle(activeWindowTitle).catch(() => {});
  }, [activeWindowTitle]);

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
    keybindings: settings.keybindings,
    onTogglePalette: () => setIsPaletteOpen((v) => !v),
    onNewLocalTab: sessions.newLocalTab,
    onDuplicateActiveTab: duplicateActiveTab,
    onCloseActiveTab: closeActiveTab,
    onNextTab: () => cycleTab(1),
    onPrevTab: () => cycleTab(-1),
    onToggleSidebar: toggleSidebar,
    onToggleSftpSplit: toggleActiveSftpSplit,
    onFindInTerminal: () => triggerFindInTab(),
    onOpenSettings: () => openSettings(),
    onToggleFullscreen: toggleFullscreen,
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
    isFullscreen,
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
    onCloseOtherTabs: requestCloseOtherTabs,
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
    onRequestCloseWindow: requestCloseWindow,
    onExitFullscreen: toggleFullscreen,
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

  const hideStaticTabBar = isFullscreen && !settings.showTabsInFullscreen;
  const tabBarNode = (
    <TabBar
      tabs={sessions.tabs}
      activeTabId={sessions.activeTabId}
      renamingTabId={sessions.renamingTabId}
      isAppElevated={isAppElevated}
      showAdminShield={settings.showAdminShield}
      tabWidthMode={settings.tabWidthMode}
      keybindings={settings.keybindings}
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
      onCloseWindow={requestCloseWindow}
      onContextMenuTab={menus.openTabMenu}
      onContextMenuTabBar={menus.openTabBarMenu}
    />
  );

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-[#090d16] text-slate-100 ${
        hasNativeBorder ? "" : "border border-slate-800"
      }`}
    >
      {!hideStaticTabBar && tabBarNode}

      {hideStaticTabBar && !fullscreenBarPeek && !hasModalOpen && (
        <div
          onMouseEnter={() => setFullscreenBarPeek(true)}
          className="fixed top-0 left-0 right-0 z-[85] h-1.5"
        />
      )}

      {hideStaticTabBar && fullscreenBarPeek && (
        <div
          onMouseLeave={() => {
            if (!contextMenu && !sessions.renamingTabId) {
              setFullscreenBarPeek(false);
            }
          }}
          className="fixed top-0 left-0 right-0 z-[88] shadow-[0_8px_24px_rgba(0,0,0,0.65)]"
        >
          {tabBarNode}
        </div>
      )}

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
                    onForceClose={() => handleEditorForceClose(tab.tabId)}
                    onCancelCloseRequest={cancelPendingWindowClose}
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
                onModalChange={sessions.handleSftpModalChange}
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
          closeTabsPrompt={closeTabsPrompt}
          onCancelCloseTabsPrompt={() => {
            pendingWindowCloseRef.current = false;
            setCloseTabsPrompt(null);
            focusTerminal();
          }}
          onConfirmCloseTabsPrompt={confirmCloseTabsPrompt}
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
