import React, { Suspense, lazy, useCallback, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { useGlobalShortcuts } from "@/shared/hooks/useGlobalShortcuts";
import { useAlert, useContextMenu } from "@/shared/ui";
import { HostSidebar, useHostProfiles, type DeletePromptState, type HostFullConfigDto } from "@/modules/hosts";
import { SftpSplitContainer } from "@/modules/sftp";
import { TerminalViewport, useSshSessions } from "@/modules/terminal";
import { TabBar } from "@/modules/workspace";
import { APP_PRELOADERS, AppModals } from "./AppModals";
import { useAppBootstrap } from "./useAppBootstrap";
import { useAppMenus } from "./useAppMenus";

const loadContextMenu = () => import("@/shared/ui/ContextMenu");
const ContextMenu = lazy(() => loadContextMenu().then((m) => ({ default: m.ContextMenu })));
const PRELOADERS = [...APP_PRELOADERS, loadContextMenu];

export const App: React.FC = () => {
  const { t } = useI18n();
  const alert = useAlert();
  const { menu: contextMenu, setMenu: setContextMenu, openMenu, closeMenu } = useContextMenu();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [keysVersion, setKeysVersion] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState<DeletePromptState | null>(null);

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

  const { settings, isAppElevated, hasNativeBorder, saveAndApplySettings } = useAppBootstrap({
    preloaders: PRELOADERS,
    onFocusTerminal: focusTerminal,
  });

  const hosts = useHostProfiles({ t, onError: alert.error, onRequestDelete: setDeletePrompt });

  const sessions = useSshSessions({
    isAppElevated,
    allProfiles: hosts.allProfiles,
    t,
    onError: alert.error,
    onDismissSidebar: () => setIsSidebarOpen(false),
    onFocusTerminal: focusTerminal,
  });

  const hasBlockingModal =
    hosts.isHostModalOpen ||
    isVaultOpen ||
    isSettingsOpen ||
    hosts.isGroupModalOpen ||
    !!sessions.authPrompt ||
    !!sessions.hostKeyPrompt ||
    sessions.portConflicts.length > 0 ||
    !!deletePrompt ||
    Object.values(sessions.sftpModalByTab).some(Boolean);

  const hasModalOpen = hasBlockingModal || isPaletteOpen;
  const suppressFocus = hasModalOpen || isSidebarOpen || !!contextMenu;

  useGlobalShortcuts({
    hasBlockingModal,
    hasAnyModal: hasModalOpen,
    isSidebarOpen,
    hasContextMenu: !!contextMenu,
    onTogglePalette: () => setIsPaletteOpen((v) => !v),
    onNewLocalTab: sessions.newLocalTab,
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
    settings,
    tabs: sessions.tabs,
    allProfiles: hosts.allProfiles,
    isAppElevated,
    hiddenTelemetryTabIds: sessions.hiddenTelemetryIds,
    setContextMenu,
    onNewLocalTab: sessions.newLocalTab,
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
    onOpenSettings: () => setIsSettingsOpen(true),
    onOpenPalette: () => setIsPaletteOpen(true),
    onDismissSidebar: dismissSidebar,
    onFocusTerminal: focusTerminal,
    onShowTelemetry: sessions.showTabTelemetry,
    onHideTelemetry: sessions.hideTabTelemetry,
  });

  const handleHostSaved = async (saved: HostFullConfigDto) => {
    await hosts.loadProfiles();
    sessions.syncHostConfigInTabs(saved);
  };

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-[#090d16] text-slate-100 ${
        hasNativeBorder ? "" : "border border-slate-800"
      }`}
    >
      <TabBar
        tabs={sessions.tabs}
        activeTabId={sessions.activeTabId}
        isAppElevated={isAppElevated}
        isModalOpen={hasModalOpen}
        profiles={hosts.allProfiles}
        onToggleSidebar={toggleSidebar}
        onSelectTab={sessions.selectTab}
        onBlankSpaceClick={dismissSidebar}
        onCloseTab={sessions.handleCloseTab}
        onReconnectTab={sessions.reconnectTab}
        onToggleSftp={sessions.toggleSftpSplit}
        onReorderTab={sessions.reorderTab}
        onNewTab={sessions.newLocalTab}
        onConnectProfile={sessions.connectHost}
        onCreateNewHost={() => hosts.openNewHost("Default")}
        onContextMenuTab={menus.openTabMenu}
        onContextMenuTabBar={menus.openTabBarMenu}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {sessions.stableTabs.map((tab) => {
          const isTabActive = tab.tabId === sessions.activeTabId;
          const configuredTelemetry =
            tab.hostId === "local" ? settings.showLocalTelemetry : (tab.telemetryEnabled ?? false);
          const showTelemetry = configuredTelemetry && !sessions.hiddenTelemetryIds[tab.tabId];

          const terminalNode =
            tab.tabKind === "sftp" ? undefined : (
              <TerminalViewport
                key={tab.tabId}
                tab={tab}
                isActive={isTabActive}
                launchCols={settings.launchCols}
                launchRows={settings.launchRows}
                showTelemetry={showTelemetry}
                telemetry={sessions.telemetryByHost[tab.hostId]}
                focusToken={focusToken}
                suppressAutoFocus={suppressFocus}
                onReconnect={sessions.reconnectTab}
                onToggleAutoReconnect={sessions.toggleAutoReconnect}
                onSessionAck={sessions.handleSessionAck}
                onElevationCancelled={sessions.handleElevationCancelled}
                onContextMenuTerminal={menus.openTerminalMenu}
                onContextMenuBanner={menus.openBannerMenu}
                onContextMenuTelemetry={menus.openTelemetryMenu}
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
              sftpEverOpened={Boolean(sessions.openedSftpTabs[tab.tabId])}
              conflictPolicy={settings.sftpConflictPolicy}
              terminal={terminalNode}
              onStartSplitResize={sessions.startSplitResize}
              onToggleSftpSplit={sessions.toggleSftpSplit}
              onOpenInTerminal={sessions.openSftpInTerminal}
              onShowMenu={openMenu}
              onConfirmDelete={requestSftpDelete}
              onModalChange={sessions.handleSftpModalChange}
              onSftpState={sessions.handleSftpState}
              onToggleAutoReconnect={sessions.toggleAutoReconnect}
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
          onOpenSettings={() => setIsSettingsOpen(true)}
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
          isSettingsOpen={isSettingsOpen}
          settings={settings}
          onCloseSettings={() => setIsSettingsOpen(false)}
          onSaveSettings={saveAndApplySettings}
          isPaletteOpen={isPaletteOpen}
          onClosePalette={() => setIsPaletteOpen(false)}
          onSelectHost={sessions.connectHost}
          onOpenSftpTab={sessions.openSftpTab}
          authPrompt={sessions.authPrompt}
          authPromptSource={sessions.authPromptSource}
          hostKeyPrompt={sessions.hostKeyPrompt}
          hostKeySource={sessions.hostKeySource}
          onCloseAuthPrompt={() => sessions.setAuthPrompt(null)}
          onCloseHostKeyPrompt={() => sessions.setHostKeyPrompt(null)}
          onReconnectTab={sessions.reconnectTab}
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
