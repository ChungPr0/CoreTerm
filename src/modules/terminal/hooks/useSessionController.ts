import React, { useCallback, useEffect, useRef } from "react";
import { EVENT_HOST_UPDATED } from "@/shared/api/ipcEvents";
import { listenEvent } from "@/shared/api/tauriClient";
import { posixCdCmd } from "@/shared/utils/path";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { useWindowMouseDrag } from "@/shared/hooks/useWindowMouseDrag";
import type { ShellProfile, TerminalTabItem } from "@/shared/types/ipc";
import { isAutoReconnectAllowed, type HostFullConfigDto, type HostProfileSummaryDto } from "@/modules/hosts";
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
  onHostUpdated?: (host: HostFullConfigDto) => void;
}

export function useSessionController({
  isAppElevated,
  defaultShellProfile,
  allProfiles,
  t,
  onError,
  onDismissSidebar,
  onFocusTerminal,
  onHostUpdated,
}: UseSessionControllerOpts) {
  const startMouseDrag = useWindowMouseDrag();
  const onHostUpdatedRef = useRef(onHostUpdated);
  onHostUpdatedRef.current = onHostUpdated;

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
      listenEvent<HostFullConfigDto>(EVENT_HOST_UPDATED, (saved) => {
        useTabsStore.getState().syncHostConfig(saved);
        onHostUpdatedRef.current?.(saved);
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
    if (tab.tabKind === "editor") {
      if (tab.editorFile?.kind === "remote") {
        sftpApi.sftpDisconnect(tab.tabId).catch(() => {});
      }
      return;
    }
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
      const canAuto = isAutoReconnectAllowed(host.auth_method, host.password_mode);
      useTabsStore.getState().addTab({
        tabId: crypto.randomUUID(),
        hostId: host.id,
        title: host.alias,
        hostSubtitle: `${host.username}@${host.host}:${host.port}`,
        state: "CONNECTING",
        errorMessage: null,
        reconnectToken: 0,
        conflictStrategy: strategy,
        canAutoReconnect: canAuto,
        autoReconnect: canAuto ? host.auto_reconnect : false,
        reconnectIntervalSec: host.reconnect_interval_sec,
      });
      onDismissSidebar();
      onFocusTerminal();
    },
    [onDismissSidebar, onFocusTerminal]
  );

  const openSftpTab = useCallback(
    (host: HostProfileSummaryDto) => {
      const canAuto = isAutoReconnectAllowed(host.auth_method, host.password_mode);
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
        canAutoReconnect: canAuto,
        autoReconnect: canAuto ? host.auto_reconnect : false,
        reconnectIntervalSec: host.reconnect_interval_sec,
      });
      onDismissSidebar();
    },
    [onDismissSidebar]
  );

  const forceCloseTabById = useCallback(
    (tabId: string) => {
      useTabsStore.getState().closeTab(tabId, disposeTab, handleEmptyTabs);
    },
    [disposeTab, handleEmptyTabs]
  );

  const closeTabById = useCallback(
    (tabId: string) => {
      const target = useTabsStore.getState().tabs.find((item) => item.tabId === tabId);
      if (target?.tabKind === "editor" && target.editorFile?.dirty) {
        useTabsStore.getState().requestEditorClose(tabId);
        return;
      }
      forceCloseTabById(tabId);
    },
    [forceCloseTabById]
  );

  const abortAuthPromptTab = useCallback(
    (tabId: string, source: "pty" | "sftp") => {
      const state = useTabsStore.getState();
      const target = state.tabs.find((tab) => tab.tabId === tabId);
      if (!target) return;
      if (source === "sftp" && target.tabKind === "editor") {
        sftpApi.sftpDisconnect(tabId).catch(() => {});
        state.setSftpState(tabId, "DISCONNECTED");
        return;
      }
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

  const reconnectTab = useCallback(
    (
      tabId: string,
      e?: React.MouseEvent | "tab" | "auto" | "banner",
      source: "tab" | "auto" | "banner" = "tab"
    ) => {
      const actualSource = typeof e === "string" ? e : source;
      if (e && typeof e !== "string") {
        e.stopPropagation();
        selectTab(tabId);
      }
      useTabsStore.getState().bumpReconnectToken(tabId, actualSource);
    },
    [selectTab]
  );

  const toggleSftpSplit = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      selectTab(tabId);
      const tab = useTabsStore.getState().tabs.find((t) => t.tabId === tabId);
      if (tab?.sftpOpen) {
        sftpApi.sftpDisconnect(tabId).catch(() => {});
      }
      useTabsStore.getState().toggleSftpSplit(tabId);
    },
    [selectTab]
  );

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
      if (tab.tabKind === "editor") return;
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
    forceCloseTabById,
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
