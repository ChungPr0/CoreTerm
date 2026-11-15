import { useCallback, useMemo } from "react";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import { useTabsStore } from "@/modules/workspace";
import { usePtyAuthPrompts } from "./usePtyAuthPrompts";
import { useSessionController } from "./useSessionController";
import { useTelemetryStore } from "./useTelemetry";

interface UseSshSessionsOpts {
  isAppElevated: boolean;
  allProfiles: HostProfileSummaryDto[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onError: (msg: string) => void;
  onDismissSidebar: () => void;
  onFocusTerminal: () => void;
}

export function useSshSessions(opts: UseSshSessionsOpts) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const openedSftpTabs = useTabsStore((s) => s.openedSftpTabs);
  const sftpModalByTab = useTabsStore((s) => s.sftpModalByTab);
  const reorderTab = useTabsStore((s) => s.reorderTab);
  const setSftpModalOpen = useTabsStore((s) => s.setSftpModalOpen);
  const setSftpState = useTabsStore((s) => s.setSftpState);
  const removeTabIfMultiple = useTabsStore((s) => s.removeTabIfMultiple);
  const toggleAutoReconnect = useTabsStore((s) => s.toggleAutoReconnect);
  const markLocalTabsAdmin = useTabsStore((s) => s.markLocalTabsAdmin);

  const telemetryByHost = useTelemetryStore((s) => s.telemetryByHost);
  const hiddenTelemetryIds = useTelemetryStore((s) => s.hiddenTelemetryIds);
  const hideTabTelemetry = useTelemetryStore((s) => s.hideTabTelemetry);
  const showTabTelemetry = useTelemetryStore((s) => s.showTabTelemetry);

  const controller = useSessionController(opts);
  const prompts = usePtyAuthPrompts(controller.spawnHostTab);

  const stableTabs = useMemo(
    () => [...tabs].sort((a, b) => a.tabId.localeCompare(b.tabId)),
    [tabs]
  );

  const duplicateTab = useCallback(
    (tab: (typeof tabs)[number]) =>
      controller.duplicateTab(tab, prompts.connectWithConflictCheck),
    [controller, prompts.connectWithConflictCheck]
  );

  return {
    tabs,
    stableTabs,
    activeTabId,
    telemetryByHost,
    hiddenTelemetryIds,
    hideTabTelemetry,
    showTabTelemetry,
    openedSftpTabs,
    sftpModalByTab,
    authPrompt: prompts.authPrompt,
    setAuthPrompt: prompts.setAuthPrompt,
    authPromptSource: prompts.authPromptSource,
    hostKeyPrompt: prompts.hostKeyPrompt,
    setHostKeyPrompt: prompts.setHostKeyPrompt,
    hostKeySource: prompts.hostKeySource,
    portConflicts: prompts.portConflicts,
    skipPortConflictsAndConnect: prompts.skipPortConflictsAndConnect,
    abortPortConflicts: prompts.abortPortConflicts,
    selectTab: controller.selectTab,
    newLocalTab: controller.newLocalTab,
    connectHost: prompts.connectWithConflictCheck,
    openSftpTab: controller.openSftpTab,
    closeTabById: controller.closeTabById,
    handleCloseTab: controller.handleCloseTab,
    reorderTab,
    closeOtherTabs: controller.closeOtherTabs,
    duplicateTab,
    reconnectTab: controller.reconnectTab,
    toggleSftpSplit: controller.toggleSftpSplit,
    openSftpInTerminal: controller.openSftpInTerminal,
    handleSftpModalChange: setSftpModalOpen,
    handleSftpState: setSftpState,
    startSplitResize: controller.startSplitResize,
    handleSessionAck: controller.handleSessionAck,
    handleElevationCancelled: removeTabIfMultiple,
    toggleAutoReconnect,
    syncHostConfigInTabs: controller.syncHostConfigInTabs,
    clearLocalHiddenTelemetry: controller.clearLocalHiddenTelemetry,
    markLocalTabsAdmin,
  };
}
