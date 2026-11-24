import React, { useCallback, useEffect, useRef, useState } from "react";
import { SFTP_DISCONNECT_RE, SFTP_PANE_SPLIT_DEFAULT } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import type { SftpConflictPolicy, TerminalTabItem } from "@/shared/types/ipc";
import { ReconnectBanner, useAlert, type ContextMenuEntry } from "@/shared/ui";
import { useWindowMouseDrag } from "@/shared/hooks/useWindowMouseDrag";
import { copyText } from "@/shared/utils/clipboard";
import { getEditableInput } from "@/shared/utils/editableTarget";
import { extractRawErrorMessage, formatLocalizedError } from "@/shared/utils/formatError";
import { localParent, posixParent } from "@/shared/utils/path";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import { useTabsStore } from "@/modules/workspace";
import { localFsApi } from "../api/localFsApi";
import { sftpApi } from "../api/sftpApi";
import { toLocalItem, toRemoteItem } from "../hooks/fileListUtils";
import { useDirectoryBrowser } from "../hooks/useDirectoryBrowser";
import { useSftpConnection } from "../hooks/useSftpConnection";
import { useSftpEntryActions } from "../hooks/useSftpEntryActions";
import { useSftpEvents } from "../hooks/useSftpEvents";
import { useSftpFileDrag } from "../hooks/useSftpFileDrag";
import { useSftpMouseNav } from "../hooks/useSftpMouseNav";
import { useSftpTransfers } from "../hooks/useSftpTransfers";
import {
  buildQueueMenu,
  buildSftpBannerMenu,
  buildToolbarMenu,
} from "../menus/sftpMenus";
import type { SftpConnectionState } from "../types";
import { SftpBrowserPanels } from "./SftpBrowserPanels";
import { SftpOverlays } from "./SftpOverlays";
import { SftpToolbar } from "./SftpToolbar";
import { TransferQueue } from "./TransferQueue";

export interface SftpPaneProps {
  tab: TerminalTabItem;
  isActive: boolean;
  isVisible: boolean;
  mode: "split" | "full";
  conflictPolicy: SftpConflictPolicy;
  pauseAutoReconnect?: boolean;
  onOpenInTerminal?: (remotePath: string) => void;
  onShowMenu: (x: number, y: number, items: ContextMenuEntry[]) => void;
  onConfirmDelete: (opts: {
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }) => void;
  onModalChange?: (tabId: string, open: boolean) => void;
  onSftpState?: (tabId: string, state: SftpConnectionState) => void;
  onToggleAutoReconnect?: (tabId: string, enabled: boolean) => void;
  onCloseSplit?: () => void;
  onOpenSftpTab?: () => void;
  onOpenSshTab?: () => void;
  onOpenSettings?: () => void;
  onCloseTab?: () => void;
}

export const SftpPane: React.FC<SftpPaneProps> = ({
  tab,
  isActive,
  isVisible,
  mode,
  conflictPolicy,
  pauseAutoReconnect = false,
  onOpenInTerminal,
  onShowMenu,
  onConfirmDelete,
  onModalChange,
  onSftpState,
  onCloseSplit,
  onOpenSftpTab,
  onOpenSshTab,
  onOpenSettings,
  onCloseTab,
}) => {
  const { t } = useI18n();
  const alert = useAlert();

  const sftpShowHiddenFiles = useSettingsStore((s) => s.settings.sftpShowHiddenFiles);
  const sftpShowLocalInSplit = useSettingsStore((s) => s.settings.sftpShowLocalInSplit);
  const sftpConfirmBeforeTransfer = useSettingsStore(
    (s) => s.settings.sftpConfirmBeforeTransfer
  );
  const sftpDoubleClickFileAction = useSettingsStore(
    (s) => s.settings.sftpDoubleClickFileAction
  );

  const [showLocal, setShowLocal] = useState(mode === "full" || sftpShowLocalInSplit);
  const prevSplitLocalDefaultRef = useRef(sftpShowLocalInSplit);
  const [splitRatio, setSplitRatio] = useState(SFTP_PANE_SPLIT_DEFAULT);

  useEffect(() => {
    if (prevSplitLocalDefaultRef.current !== sftpShowLocalInSplit) {
      prevSplitLocalDefaultRef.current = sftpShowLocalInSplit;
      if (mode === "split") {
        setShowLocal(sftpShowLocalInSplit);
      }
    }
  }, [mode, sftpShowLocalInSplit]);

  const containerRef = useRef<HTMLDivElement>(null);
  const remoteDropRef = useRef<HTMLDivElement>(null);
  const connStateRef = useRef<SftpConnectionState>("CONNECTING");
  const showLocalRef = useRef(showLocal);
  const activePaneRef = useRef<"local" | "remote">("remote");
  const modalOpenRef = useRef(false);
  const markDisconnectRef = useRef<() => void>(() => {});
  showLocalRef.current = showLocal;

  const notifyError = useCallback(
    (err: unknown) => alert.error(formatLocalizedError(err, t)),
    [alert, t]
  );

  const remote = useDirectoryBrowser({
    defaultHome: "",
    parentPath: posixParent,
    fetchDir: async (path) => {
      const res = await sftpApi.sftpListDir(tab.tabId, path);
      return { path: res.path, items: res.entries.map(toRemoteItem) };
    },
    onError: (err) => {
      if (SFTP_DISCONNECT_RE.test(extractRawErrorMessage(err))) {
        markDisconnectRef.current();
      }
      notifyError(err);
    },
  });

  const local = useDirectoryBrowser({
    parentPath: localParent,
    fetchDir: async (path) => {
      const res = await localFsApi.localListDir(path);
      return { path: res.path, items: res.entries.map(toLocalItem) };
    },
    onError: notifyError,
  });

  const transfers = useSftpTransfers({
    tabId: tab.tabId,
    connStateRef,
    showLocalRef,
    conflictPolicy,
    confirmBeforeTransfer: sftpConfirmBeforeTransfer,
    remoteBrowser: remote,
    localBrowser: local,
    onError: notifyError,
  });

  const isSplit = mode === "split";
  const canConnect = isSplit ? tab.state === "ONLINE" : true;

  const conn = useSftpConnection({
    tabId: tab.tabId,
    hostId: tab.hostId,
    reconnectToken: tab.reconnectToken,
    reconnectSource: tab.reconnectSource,
    isSplit,
    autoReconnect: tab.autoReconnect,
    canAutoReconnect: tab.canAutoReconnect,
    pauseAutoReconnect,
    reconnectIntervalSec: tab.reconnectIntervalSec,
    remoteBrowser: remote,
    localBrowser: local,
    enabled: canConnect,
    onSftpState,
    onHydrateJobs: transfers.setJobs,
    onError: notifyError,
  });

  connStateRef.current = conn.connState;
  markDisconnectRef.current = conn.markDisconnectedOnError;

  const hostLabel = tab.title.replace(/^SFTP:\s*/i, "");
  const entryActions = useSftpEntryActions({
    tab,
    hostLabel,
    connStateRef,
    showLocalRef,
    remote,
    local,
    notifyError,
    onConfirmDelete,
  });

  const isAutoReconnect = Boolean(
    tab.autoReconnect && tab.canAutoReconnect !== false && !conn.authBlocked
  );
  const showSftpConnectingBanner =
    conn.connState === "CONNECTING" &&
    (tab.reconnectSource === "auto" || tab.reconnectSource === "banner");
  const showSftpReconnect =
    mode === "full" && (conn.sftpOffline || showSftpConnectingBanner);

  const hasSftpModal =
    transfers.conflicts.length > 0 ||
    entryActions.nameModal !== null ||
    entryActions.chmodItem !== null ||
    transfers.pendingTransfer !== null;
  modalOpenRef.current = hasSftpModal;

  useEffect(() => {
    onModalChange?.(tab.tabId, hasSftpModal);
  }, [tab.tabId, hasSftpModal, onModalChange]);

  useSftpMouseNav({
    isVisible,
    modalOpenRef,
    showLocalRef,
    activePaneRef,
    onNavigate: (kind, delta) => (kind === "local" ? local : remote).goHistory(delta),
  });

  const { requestUpload, requestDownload } = transfers;

  const nativeDragActive = useSftpEvents({
    tabId: tab.tabId,
    isActive,
    isVisible,
    remoteDropRef,
    onStatus: conn.handleStatus,
    onProgress: transfers.handleProgress,
    onConflict: transfers.handleConflict,
    onNativeDrop: requestUpload,
  });

  const fileDrag = useSftpFileDrag({
    enabled: showLocal && conn.connState === "CONNECTED",
    containerRef,
    onDropTransfer: (fromKind, paths, targetDir) => {
      if (fromKind === "local") requestUpload(paths, targetDir);
      else void requestDownload(paths, targetDir);
    },
  });

  const startMouseDrag = useWindowMouseDrag();

  const startSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const box = containerRef.current;
    if (!box) return;
    startMouseDrag({
      cursor: "col-resize",
      lockUserSelect: true,
      onMove: (ev) => {
        const rect = box.getBoundingClientRect();
        if (rect.width > 0) {
          setSplitRatio(Math.min(0.82, Math.max(0.18, (ev.clientX - rect.left) / rect.width)));
        }
      },
    });
  };

  const reconnectSftp = useCallback(() => {
    if (!canConnect) return;
    conn.setAuthBlocked(false);
    conn.clearErrorDedup();
    void conn.connectSftp();
    if (!local.cwdRef.current) {
      void conn.loadLocalFs();
    }
  }, [canConnect, conn, local.cwdRef]);

  const manualReconnectSftp = useCallback(() => {
    if (!canConnect) return;
    conn.setAuthBlocked(false);
    conn.clearErrorDedup();
    useTabsStore.getState().bumpReconnectToken(tab.tabId, "banner");
    if (!local.cwdRef.current) {
      void conn.loadLocalFs();
    }
  }, [canConnect, conn, local.cwdRef, tab.tabId]);

  const handleCloseSurface = mode === "split" ? onCloseSplit : onCloseTab;

  const refreshAllPanes = useCallback(() => {
    if (remote.cwdRef.current || remote.homeRef.current) remote.refresh();
    else if (conn.connState === "CONNECTED") void remote.loadDir("/");
    if (showLocalRef.current) {
      void conn.refreshLocalFs();
    }
  }, [conn, remote]);

  const buildCurrentToolbarMenu = () =>
    buildToolbarMenu({
      t,
      mode,
      connState: conn.connState,
      canConnect,
      showLocal,
      remoteCwd: remote.cwd,
      onReconnect: reconnectSftp,
      onRefresh: refreshAllPanes,
      onToggleLocalPane: () => setShowLocal((v) => !v),
      onCopyRemotePath: entryActions.handleCopyPath,
      onOpenInTerminal,
      onOpenSftpTab,
      onOpenSshTab,
      onOpenSettings,
      onClose: handleCloseSurface,
    });

  return (
    <div
      onContextMenu={(e) => {
        if (
          getEditableInput(e.target) ||
          (e.target as HTMLElement | null)?.closest?.("[data-modal-root='true']")
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onShowMenu(e.clientX, e.clientY, buildCurrentToolbarMenu());
      }}
      className="relative flex h-full min-h-0 select-none flex-col bg-ct-panel text-[#c9d1d9]"
    >
      <SftpToolbar
        hostLabel={hostLabel}
        connState={conn.connState}
        remoteCwd={remote.cwd}
        showLocal={showLocal}
        onOpenInTerminal={onOpenInTerminal}
        onToggleLocalPane={() => setShowLocal((v) => !v)}
        onCloseSplit={onCloseSplit}
        onContextMenu={(e) => {
          if (getEditableInput(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          onShowMenu(e.clientX, e.clientY, buildCurrentToolbarMenu());
        }}
      />

      <SftpBrowserPanels
        mode={mode}
        containerRef={containerRef}
        remoteDropRef={remoteDropRef}
        activePaneRef={activePaneRef}
        showLocal={showLocal}
        splitRatio={splitRatio}
        showHiddenFiles={sftpShowHiddenFiles}
        doubleClickFileAction={sftpDoubleClickFileAction}
        connState={conn.connState}
        connected={conn.connState === "CONNECTED"}
        nativeDragActive={nativeDragActive}
        local={local}
        remote={remote}
        localDrives={conn.localDrives}
        remoteDrives={conn.remoteDrives}
        fileDrag={fileDrag}
        onResetSplit={() => setSplitRatio(SFTP_PANE_SPLIT_DEFAULT)}
        onStartSplitDrag={startSplitDrag}
        onToggleLocalPane={() => setShowLocal((v) => !v)}
        onOpenInTerminal={onOpenInTerminal}
        onShowMenu={onShowMenu}
        onNamePrompt={entryActions.setNameModal}
        onOpenFile={entryActions.handleOpenFile}
        onChmod={entryActions.setChmodItem}
        onCopyPath={entryActions.handleCopyPath}
        onRequestDelete={entryActions.requestDelete}
        onRequestUpload={requestUpload}
        onRequestDownload={(paths) => void requestDownload(paths)}
        onUploadDialog={(dir) => void transfers.uploadViaDialog(dir)}
        onReloadLocal={() => void conn.refreshLocalFs()}
        onRefreshLocalDrives={() => void conn.refreshLocalDrives()}
        onOpenSettings={onOpenSettings}
        onClose={handleCloseSurface}
      />

      <TransferQueue
        jobs={transfers.jobs}
        expanded={transfers.queueOpen}
        onToggleExpand={() => transfers.setQueueOpen((v) => !v)}
        onPause={transfers.pauseTransfer}
        onResume={transfers.resumeTransfer}
        onCancel={transfers.cancelTransfer}
        onClearFinished={transfers.clearFinished}
        onContextMenuQueue={(job, hasFinished, e) =>
          onShowMenu(
            e.clientX,
            e.clientY,
            buildQueueMenu({
              job,
              hasFinished,
              expanded: transfers.queueOpen,
              jobsCount: transfers.jobs.length,
              mode,
              isConnecting: conn.connState === "CONNECTING",
              canConnect,
              t,
              onPause: transfers.pauseTransfer,
              onResume: transfers.resumeTransfer,
              onCancel: transfers.cancelTransfer,
              onClearFinished: transfers.clearFinished,
              onToggleExpand: () => transfers.setQueueOpen((v) => !v),
              onCopyPath: entryActions.handleCopyPath,
              onReconnect: reconnectSftp,
              onOpenSettings,
              onClose: handleCloseSurface,
            })
          )
        }
      />

      <SftpOverlays
        pendingTransfer={transfers.pendingTransfer}
        transferBusy={transfers.transferBusy}
        onCancelTransfer={transfers.cancelPendingTransfer}
        onConfirmTransfer={transfers.confirmPendingTransfer}
        activeConflict={transfers.conflicts[0] ?? null}
        onResolveConflict={transfers.resolveConflict}
        nameModal={entryActions.nameModal}
        onCancelNameModal={() => entryActions.setNameModal(null)}
        onSubmitNameModal={entryActions.handleNameSubmit}
        chmodItem={entryActions.chmodItem}
        onCloseChmod={() => entryActions.setChmodItem(null)}
        onConfirmChmod={entryActions.handleConfirmChmod}
        dragPreview={fileDrag.dragPreview}
      />

      {conn.connState === "CONNECTING" && (
        <div className="absolute top-0 left-0 right-0 z-30 h-[2px] overflow-hidden bg-sky-950/30 pointer-events-none">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-ct-accent to-transparent animate-shimmer" />
        </div>
      )}

      {showSftpReconnect && (
        <ReconnectBanner
          isDisconnected={conn.sftpOffline}
          isConnecting={conn.connState === "CONNECTING"}
          isAutoReconnect={isAutoReconnect}
          onReconnect={manualReconnectSftp}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const selectedText = window.getSelection()?.toString() ?? "";
            onShowMenu(
              e.clientX,
              e.clientY,
              buildSftpBannerMenu({
                t,
                mode,
                selectedText,
                isConnecting: conn.connState === "CONNECTING",
                onCopy: (text) => void copyText(text),
                onReconnect: manualReconnectSftp,
                onOpenSshTab,
                onOpenSettings,
                onClose: handleCloseSurface,
              })
            );
          }}
        />
      )}
    </div>
  );
};
