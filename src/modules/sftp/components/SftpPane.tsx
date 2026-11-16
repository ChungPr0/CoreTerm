import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import type { SftpConflictPolicy, TerminalTabItem } from "@/shared/types/ipc";
import { useAlert, type ContextMenuEntry } from "@/shared/ui";
import { useWindowMouseDrag } from "@/shared/hooks/useWindowMouseDrag";
import { copyText } from "@/shared/utils/clipboard";
import { getEditableInput } from "@/shared/utils/editableTarget";
import { extractRawErrorMessage, formatLocalizedError } from "@/shared/utils/formatError";
import { localParent, posixParent } from "@/shared/utils/path";
import { localFsApi } from "../api/localFsApi";
import { sftpApi } from "../api/sftpApi";
import { toLocalItem, toRemoteItem } from "../hooks/fileListUtils";
import { useDirectoryBrowser } from "../hooks/useDirectoryBrowser";
import { useSftpConnection } from "../hooks/useSftpConnection";
import { useSftpEvents } from "../hooks/useSftpEvents";
import { useSftpFileDrag } from "../hooks/useSftpFileDrag";
import { useSftpMouseNav } from "../hooks/useSftpMouseNav";
import { useSftpTransfers } from "../hooks/useSftpTransfers";
import { buildQueueMenu, buildToolbarMenu } from "../menus/sftpMenus";
import type { FileItem, SftpConnectionState } from "../types";
import { SftpBrowserPanels } from "./SftpBrowserPanels";
import { SftpOverlays, type NamePromptState } from "./SftpOverlays";
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
  onToggleAutoReconnect,
  onCloseSplit,
}) => {
  const { t } = useI18n();
  const alert = useAlert();

  const [showLocal, setShowLocal] = useState(mode === "full");
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [nameModal, setNameModal] = useState<NamePromptState | null>(null);
  const [chmodItem, setChmodItem] = useState<FileItem | null>(null);

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
    defaultHome: "/",
    parentPath: posixParent,
    fetchDir: async (path) => {
      const res = await sftpApi.sftpListDir(tab.tabId, path);
      return { path: res.path, items: res.entries.map(toRemoteItem) };
    },
    onError: (err) => {
      if (/sender dropped|channel closed|disconnected|not found/i.test(extractRawErrorMessage(err))) {
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
    remoteBrowser: remote,
    localBrowser: local,
    onError: notifyError,
  });

  const conn = useSftpConnection({
    tabId: tab.tabId,
    hostId: tab.hostId,
    reconnectToken: tab.reconnectToken,
    autoReconnect: tab.autoReconnect,
    pauseAutoReconnect,
    reconnectIntervalSec: tab.reconnectIntervalSec,
    remoteBrowser: remote,
    localBrowser: local,
    onSftpState,
    onHydrateJobs: transfers.setJobs,
    onError: notifyError,
  });

  connStateRef.current = conn.connState;
  markDisconnectRef.current = conn.markDisconnectedOnError;

  const hasSftpModal =
    transfers.conflicts.length > 0 ||
    nameModal !== null ||
    chmodItem !== null ||
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
    onDropTransfer: (fromKind, paths) => {
      if (fromKind === "local") requestUpload(paths);
      else void requestDownload(paths);
    },
  });

  const handleCopyPath = useCallback(
    (path: string) => void copyText(path).then(() => alert.info(t("sftp.copied"), 2500)),
    [alert, t]
  );

  const requestDelete = useCallback(
    (targetKind: "local" | "remote", paths: string[]) => {
      if (paths.length === 0 || (targetKind === "remote" && connStateRef.current !== "CONNECTED")) {
        return;
      }
      onConfirmDelete({
        title: t("sftp.delete_confirm_title"),
        message: t("sftp.delete_confirm_message", { count: paths.length }),
        onConfirm: async () => {
          if (targetKind === "remote") {
            await sftpApi.sftpDelete(tab.tabId, paths);
            remote.refresh();
          } else {
            await localFsApi.localDelete(paths);
            local.refresh();
          }
        },
      });
    },
    [local, onConfirmDelete, remote, t, tab.tabId]
  );

  const handleNameSubmit = async (name: string) => {
    if (!nameModal) return;
    if (nameModal.kind === "mkdir") {
      if (nameModal.targetKind === "remote") {
        await sftpApi.sftpCreateDir(tab.tabId, remote.cwd, name);
        remote.refresh();
      } else {
        await localFsApi.localCreateDir(local.cwd, name);
        local.refresh();
      }
    } else if (nameModal.targetKind === "remote") {
      await sftpApi.sftpRename(tab.tabId, nameModal.item.path, name);
      remote.refresh();
    } else {
      await localFsApi.localRename(nameModal.item.path, name);
      local.refresh();
    }
    setNameModal(null);
  };

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
    conn.setAuthBlocked(false);
    conn.clearErrorDedup();
    void conn.connectSftp();
    if (!local.cwdRef.current) {
      void conn.loadLocalFs();
    }
  }, [conn, local.cwdRef]);

  return (
    <div
      onContextMenu={(e) => {
        if (getEditableInput(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        onShowMenu(e.clientX, e.clientY, []);
      }}
      className="flex h-full min-h-0 select-none flex-col bg-[#0d1117] text-[#c9d1d9]"
    >
      <SftpToolbar
        hostLabel={tab.title.replace(/^SFTP:\s*/i, "")}
        connState={conn.connState}
        sftpOffline={conn.sftpOffline}
        remoteCwd={remote.cwd}
        showLocal={showLocal}
        autoReconnect={tab.autoReconnect}
        onReconnect={reconnectSftp}
        onToggleAutoReconnect={
          onToggleAutoReconnect
            ? (enabled) => {
                if (enabled) conn.setAuthBlocked(false);
                onToggleAutoReconnect(tab.tabId, enabled);
              }
            : undefined
        }
        onOpenInTerminal={onOpenInTerminal}
        onToggleLocalPane={() => setShowLocal((v) => !v)}
        onCloseSplit={onCloseSplit}
        onContextMenu={(e) => {
          if (getEditableInput(e.target)) return;
          e.preventDefault();
          e.stopPropagation();
          onShowMenu(
            e.clientX,
            e.clientY,
            buildToolbarMenu({ t, onReconnect: reconnectSftp })
          );
        }}
      />

      <SftpBrowserPanels
        containerRef={containerRef}
        remoteDropRef={remoteDropRef}
        activePaneRef={activePaneRef}
        showLocal={showLocal}
        splitRatio={splitRatio}
        connState={conn.connState}
        connected={conn.connState === "CONNECTED"}
        nativeDragActive={nativeDragActive}
        local={local}
        remote={remote}
        localDrives={conn.localDrives}
        remoteDrives={conn.remoteDrives}
        fileDrag={fileDrag}
        onResetSplit={() => setSplitRatio(0.5)}
        onStartSplitDrag={startSplitDrag}
        onShowMenu={onShowMenu}
        onNamePrompt={setNameModal}
        onChmod={setChmodItem}
        onCopyPath={handleCopyPath}
        onRequestDelete={requestDelete}
        onRequestUpload={requestUpload}
        onRequestDownload={(paths) => void requestDownload(paths)}
        onUploadDialog={(dir) => void transfers.uploadViaDialog(dir)}
        onReloadLocal={() => void conn.loadLocalFs()}
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
              t,
              onPause: transfers.pauseTransfer,
              onResume: transfers.resumeTransfer,
              onCancel: transfers.cancelTransfer,
              onClearFinished: transfers.clearFinished,
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
        nameModal={nameModal}
        onCancelNameModal={() => setNameModal(null)}
        onSubmitNameModal={handleNameSubmit}
        chmodItem={chmodItem}
        onCloseChmod={() => setChmodItem(null)}
        onConfirmChmod={async (nextMode) => {
          if (!chmodItem) return;
          try {
            await sftpApi.sftpChmod(tab.tabId, chmodItem.path, nextMode);
            remote.refresh();
          } catch (err) {
            notifyError(err);
          }
        }}
        dragPreview={fileDrag.dragPreview}
      />
    </div>
  );
};
