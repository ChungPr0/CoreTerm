import React, { useCallback, useEffect } from "react";
import { posixCdCmd } from "@/shared/utils/path";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { useWindowMouseDrag } from "@/shared/hooks/useWindowMouseDrag";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import type { HostFullConfigDto, HostProfileSummaryDto } from "@/modules/hosts";
import { sftpApi } from "@/modules/sftp";
import { createLocalTab, useTabsStore, windowApi } from "@/modules/workspace";
import { sessionApi } from "../api/sessionApi";
import type { ConflictStrategy, SessionConnectAckDto } from "../types";

export interface NewLocalTabOpts {
  profile?: ShellProfile;
  asAdmin?: boolean;
}

interface UseSessionControllerOpts {
  isAppElevated: boolean;
  defaultShellProfile: ShellProfile | null;
  allProfiles: HostProfileSummaryDto[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onError: (msg: string) => void;
  onDismissSidebar: () => void;
  onFocusTerminal: () => void;
}

export function useSessionController({
  isAppElevated,
  defaultShellProfile,
  allProfiles,
  t,
  onError,
  onDismissSidebar,
  onFocusTerminal,
}: UseSessionControllerOpts) {
  const startMouseDrag = useWindowMouseDrag();
  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];

    Promise.all([
      sessionApi.onSessionStatus((payload) => {
        useTabsStore
          .getState()
          .updateSessionStatus(
            payload.tab_id,
            payload.state,
            payload.error_message ?? null,
            payload.active_local_forwards
          );
      }),
    ]).then((fns) => {
      if (!active) {
        fns.forEach((fn) => fn());
        return;
      }
      unlisteners.push(...fns);
    });

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const disposeTab = useCallback((tab: TerminalTabItem, hadSftp: boolean) => {
    if (tab.tabKind !== "sftp") sessionApi.sessionDisconnect(tab.tabId).catch(() => {});
    if (tab.tabKind === "sftp" || hadSftp) sftpApi.sftpDisconnect(tab.tabId).catch(() => {});
  }, []);

  const handleEmptyTabs = useCallback(() => {
    windowApi.windowClose().catch(() => {});
  }, []);

  const selectTab = useCallback(
    (tabId: string) => {
      useTabsStore.getState().setActiveTabId(tabId);
      onDismissSidebar();
      onFocusTerminal();
    },
    [onDismissSidebar, onFocusTerminal]
  );

  const newLocalTab = useCallback(
    (opts?: NewLocalTabOpts) => {
      const profile = opts?.profile ?? defaultShellProfile;
      const asAdmin =
        typeof opts?.asAdmin === "boolean" ? opts.asAdmin : isAppElevated;
      const tab = createLocalTab(profile, asAdmin);
      useTabsStore.getState().addTab(tab);
      onDismissSidebar();
      onFocusTerminal();
    },
    [defaultShellProfile, isAppElevated, onDismissSidebar, onFocusTerminal]
  );

  const spawnHostTab = useCallback(
    (host: HostProfileSummaryDto, strategy: ConflictStrategy) => {
      useTabsStore.getState().addTab({
        tabId: crypto.randomUUID(),
        hostId: host.id,
        title: host.alias,
        hostSubtitle: `${host.username}@${host.host}:${host.port}`,
        state: "CONNECTING",
        errorMessage: null,
        reconnectToken: 0,
        conflictStrategy: strategy,
        autoReconnect: host.auto_reconnect,
        reconnectIntervalSec: host.reconnect_interval_sec,
      });
      onDismissSidebar();
      onFocusTerminal();
    },
    [onDismissSidebar, onFocusTerminal]
  );

  const openSftpTab = useCallback(
    (host: HostProfileSummaryDto) => {
      useTabsStore.getState().addTab({
        tabId: crypto.randomUUID(),
        hostId: host.id,
        title: host.alias,
        hostSubtitle: `${host.username}@${host.host}:${host.port}`,
        state: "CONNECTING",
        errorMessage: null,
        reconnectToken: 0,
        tabKind: "sftp",
        sftpState: "CONNECTING",
        autoReconnect: host.auto_reconnect,
        reconnectIntervalSec: host.reconnect_interval_sec,
      });
      onDismissSidebar();
    },
    [onDismissSidebar]
  );

  const closeTabById = useCallback(
    (tabId: string) => {
      useTabsStore.getState().closeTab(tabId, disposeTab, handleEmptyTabs);
    },
    [disposeTab, handleEmptyTabs]
  );

  const abortAuthPromptTab = useCallback(
    (tabId: string, source: "pty" | "sftp") => {
      const state = useTabsStore.getState();
      const target = state.tabs.find((tab) => tab.tabId === tabId);
      if (!target) return;
      if (source === "sftp" && target.tabKind !== "sftp") {
        sftpApi.sftpDisconnect(tabId).catch(() => {});
        if (target.sftpOpen) state.toggleSftpSplit(tabId);
        return;
      }
      if (state.tabs.length <= 1) {
        newLocalTab();
      }
      closeTabById(tabId);
    },
    [closeTabById, newLocalTab]
  );

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      closeTabById(tabId);
    },
    [closeTabById]
  );

  const closeOtherTabs = useCallback(
    (keepTabId: string) => {
      useTabsStore.getState().closeOtherTabs(keepTabId, disposeTab);
    },
    [disposeTab]
  );

  const reconnectTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    useTabsStore.getState().bumpReconnectToken(tabId);
  }, []);

  const toggleSftpSplit = useCallback((tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    useTabsStore.getState().toggleSftpSplit(tabId);
  }, []);

  const openSftpInTerminal = useCallback(
    (tabId: string, remotePath: string) => {
      const bytes = Array.from(new TextEncoder().encode(posixCdCmd(remotePath)));
      void sessionApi.sessionWriteStdin(tabId, bytes).catch((err) => {
        onError(formatLocalizedError(err, t));
      });
      onFocusTerminal();
    },
    [onError, onFocusTerminal, t]
  );

  const startSplitResize = useCallback(
    (tabId: string, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
      if (!rect || rect.height <= 0) return;

      startMouseDrag({
        cursor: "row-resize",
        lockUserSelect: true,
        onMove: (ev) => {
          const clamped = Math.min(0.75, Math.max(0.25, (rect.bottom - ev.clientY) / rect.height));
          useTabsStore.getState().resizeSftpSplit(tabId, clamped);
        },
      });
    },
    [startMouseDrag]
  );

  const handleSessionAck = useCallback((tabId: string, ack: SessionConnectAckDto) => {
    useTabsStore.getState().updateSessionAck(tabId, ack.is_admin, ack.shell_profile);
  }, []);

  const switchTabShell = useCallback(
    (tabId: string, profile: ShellProfile) => {
      useTabsStore.getState().setTabShell(tabId, profile, true);
    },
    []
  );

  const syncHostConfigInTabs = useCallback((saved: HostFullConfigDto) => {
    useTabsStore.getState().syncHostConfig(saved);
  }, []);

  const duplicateTab = useCallback(
    (tab: TerminalTabItem, connectHostFn: (host: HostProfileSummaryDto) => Promise<void>) => {
      if (tab.hostId === "local") {
        newLocalTab({ profile: tab.shellProfile, asAdmin: !!tab.isAdmin });
        return;
      }
      const profile = allProfiles.find((p) => p.id === tab.hostId);
      if (!profile) return;
      if (tab.tabKind === "sftp") openSftpTab(profile);
      else void connectHostFn(profile);
    },
    [allProfiles, newLocalTab, openSftpTab]
  );

  return {
    selectTab,
    newLocalTab,
    spawnHostTab,
    openSftpTab,
    closeTabById,
    handleCloseTab,
    closeOtherTabs,
    abortAuthPromptTab,
    reconnectTab,
    switchTabShell,
    toggleSftpSplit,
    openSftpInTerminal,
    startSplitResize,
    handleSessionAck,
    syncHostConfigInTabs,
    duplicateTab,
  };
}
