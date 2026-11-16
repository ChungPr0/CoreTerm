import { useCallback, useEffect, useMemo } from "react";
import type { ShellProfile } from "@/shared/types/ipc";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import { useTabsStore } from "@/modules/workspace";
import { usePtyAuthPrompts } from "./usePtyAuthPrompts";
import { useSessionController } from "./useSessionController";

interface UseSshSessionsOpts {
  isAppElevated: boolean;
  defaultShellProfile: ShellProfile | null;
  allProfiles: HostProfileSummaryDto[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onError: (msg: string) => void;
  onDismissSidebar: () => void;
  onFocusTerminal: () => void;
}

export function useSshSessions(opts: UseSshSessionsOpts) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const renamingTabId = useTabsStore((s) => s.renamingTabId);
  const openedSftpTabs = useTabsStore((s) => s.openedSftpTabs);
  const sftpModalByTab = useTabsStore((s) => s.sftpModalByTab);
  const startRenamingTab = useTabsStore((s) => s.startRenamingTab);
  const cancelRenamingTab = useTabsStore((s) => s.cancelRenamingTab);
  const renameTab = useTabsStore((s) => s.renameTab);
  const reorderTab = useTabsStore((s) => s.reorderTab);
  const setSftpModalOpen = useTabsStore((s) => s.setSftpModalOpen);
  const setSftpState = useTabsStore((s) => s.setSftpState);
  const removeTabIfMultiple = useTabsStore((s) => s.removeTabIfMultiple);
  const toggleAutoReconnect = useTabsStore((s) => s.toggleAutoReconnect);
  const markLocalTabsAdmin = useTabsStore((s) => s.markLocalTabsAdmin);

  const controller = useSessionController(opts);
  const prompts = usePtyAuthPrompts(controller.spawnHostTab);
  const { prunePromptsForClosedTabs } = prompts;

  useEffect(() => {
    prunePromptsForClosedTabs(new Set(tabs.map((t) => t.tabId)));
  }, [tabs, prunePromptsForClosedTabs]);

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
    renamingTabId,
    openedSftpTabs,
    sftpModalByTab,
    startRenamingTab,
    cancelRenamingTab,
    renameTab,
    authPrompt: prompts.authPrompt,
    dismissAuthPrompt: prompts.dismissAuthPrompt,
    authPromptSource: prompts.authPromptSource,
    hostKeyPrompt: prompts.hostKeyPrompt,
    dismissHostKeyPrompt: prompts.dismissHostKeyPrompt,
    hostKeySource: prompts.hostKeySource,
    portConflicts: prompts.portConflicts,
    skipPortConflictsAndConnect: prompts.skipPortConflictsAndConnect,
    abortPortConflicts: prompts.abortPortConflicts,
    selectTab: controller.selectTab,
    newLocalTab: controller.newLocalTab,
    connectHost: prompts.connectWithConflictCheck,
    openSftpTab: controller.openSftpTab,
    closeTabById: controller.closeTabById,
    abortAuthTab: controller.abortAuthPromptTab,
    handleCloseTab: controller.handleCloseTab,
    reorderTab,
    closeOtherTabs: controller.closeOtherTabs,
    duplicateTab,
    reconnectTab: controller.reconnectTab,
    switchTabShell: controller.switchTabShell,
    toggleSftpSplit: controller.toggleSftpSplit,
    openSftpInTerminal: controller.openSftpInTerminal,
    handleSftpModalChange: setSftpModalOpen,
    handleSftpState: setSftpState,
    startSplitResize: controller.startSplitResize,
    handleSessionAck: controller.handleSessionAck,
    handleElevationCancelled: removeTabIfMultiple,
    toggleAutoReconnect,
    syncHostConfigInTabs: controller.syncHostConfigInTabs,
    markLocalTabsAdmin,
  };
}
