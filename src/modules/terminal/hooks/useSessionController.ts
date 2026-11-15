import React, { useCallback, useEffect } from "react";
import { posixCdCmd } from "@/shared/utils/path";
import { formatLocalizedError } from "@/shared/utils/formatError";
import type { TerminalTabItem } from "@/shared/types/ipc";
import type { HostFullConfigDto, HostProfileSummaryDto } from "@/modules/hosts";
import { sftpApi } from "@/modules/sftp";
import { createLocalTab, useTabsStore, windowApi } from "@/modules/workspace";
import { sessionApi } from "../api/sessionApi";
import { telemetryApi } from "../api/telemetryApi";
import type { ConflictStrategy, SessionConnectAckDto } from "../types";
import { useTelemetryStore } from "./useTelemetry";

interface UseSessionControllerOpts {
  isAppElevated: boolean;
  allProfiles: HostProfileSummaryDto[];
  t: (key: string, params?: Record<string, string | number>) => string;
  onError: (msg: string) => void;
  onDismissSidebar: () => void;
  onFocusTerminal: () => void;
}

export function useSessionController({
  isAppElevated,
  allProfiles,
  t,
  onError,
  onDismissSidebar,
  onFocusTerminal,
}: UseSessionControllerOpts) {
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
      telemetryApi.onTelemetryMetrics((p) => {
        useTelemetryStore.getState().setMetric(p);
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
    (explicitAdmin?: boolean) => {
      const tab = createLocalTab(
        typeof explicitAdmin === "boolean" ? explicitAdmin : isAppElevated
      );
      useTabsStore.getState().addTab(tab);
      onDismissSidebar();
      onFocusTerminal();
    },
    [isAppElevated, onDismissSidebar, onFocusTerminal]
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
        telemetryEnabled: host.telemetry_enabled,
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

  const startSplitResize = useCallback((tabId: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;

    const onMove = (ev: MouseEvent) => {
      const clamped = Math.min(0.75, Math.max(0.25, (rect.bottom - ev.clientY) / rect.height));
      useTabsStore.getState().resizeSftpSplit(tabId, clamped);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const handleSessionAck = useCallback((tabId: string, ack: SessionConnectAckDto) => {
    useTabsStore.getState().updateSessionAck(tabId, ack.is_admin);
  }, []);

  const syncHostConfigInTabs = useCallback((saved: HostFullConfigDto) => {
    useTabsStore.getState().syncHostConfig(saved);
    if (saved.options.telemetry_enabled) {
      const ids = useTabsStore
        .getState()
        .tabs.filter((tab) => tab.hostId === saved.id)
        .map((tab) => tab.tabId);
      useTelemetryStore.getState().clearHiddenForTabs(ids);
    }
  }, []);

  const clearLocalHiddenTelemetry = useCallback(() => {
    const ids = useTabsStore
      .getState()
      .tabs.filter((tab) => tab.hostId === "local")
      .map((tab) => tab.tabId);
    useTelemetryStore.getState().clearHiddenForTabs(ids);
  }, []);

  const duplicateTab = useCallback(
    (tab: TerminalTabItem, connectHostFn: (host: HostProfileSummaryDto) => Promise<void>) => {
      if (tab.hostId === "local") {
        newLocalTab(!!tab.isAdmin);
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
    reconnectTab,
    toggleSftpSplit,
    openSftpInTerminal,
    startSplitResize,
    handleSessionAck,
    syncHostConfigInTabs,
    clearLocalHiddenTelemetry,
    duplicateTab,
  };
}
