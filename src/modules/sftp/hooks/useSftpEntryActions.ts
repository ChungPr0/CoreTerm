import { useCallback, useEffect, useRef, useState } from "react";
import { TOAST_COPY_MS } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import type { TerminalTabItem } from "@/shared/types/ipc";
import { useAlert } from "@/shared/ui";
import { copyText } from "@/shared/utils/clipboard";
import { useTabsStore } from "@/modules/workspace";
import { localFsApi } from "../api/localFsApi";
import { sftpApi } from "../api/sftpApi";
import type { NamePromptState } from "../components/SftpOverlays";
import type { FileItem, SftpConnectionState } from "../types";
import type { DirectoryBrowser } from "./useDirectoryBrowser";

interface UseSftpEntryActionsOpts {
  tab: TerminalTabItem;
  hostLabel: string;
  connStateRef: React.MutableRefObject<SftpConnectionState>;
  showLocalRef: React.MutableRefObject<boolean>;
  remote: DirectoryBrowser;
  local: DirectoryBrowser;
  notifyError: (err: unknown) => void;
  onConfirmDelete: (opts: {
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }) => void;
}

export function useSftpEntryActions({
  tab,
  hostLabel,
  connStateRef,
  showLocalRef,
  remote,
  local,
  notifyError,
  onConfirmDelete,
}: UseSftpEntryActionsOpts) {
  const { t } = useI18n();
  const alert = useAlert();

  const [nameModal, setNameModal] = useState<NamePromptState | null>(null);
  const [chmodItem, setChmodItem] = useState<FileItem | null>(null);

  const remoteRefreshSeq = useTabsStore((s) => s.sftpRefreshSeqByHost[tab.hostId] ?? 0);
  const localRefreshSeq = useTabsStore((s) => s.sftpRefreshSeqByHost.local ?? 0);
  const prevRemoteRefreshRef = useRef(remoteRefreshSeq);
  const prevLocalRefreshRef = useRef(localRefreshSeq);

  useEffect(() => {
    if (remoteRefreshSeq > prevRemoteRefreshRef.current) {
      prevRemoteRefreshRef.current = remoteRefreshSeq;
      if (connStateRef.current === "CONNECTED") remote.refresh();
    }
  }, [connStateRef, remote, remoteRefreshSeq]);

  useEffect(() => {
    if (localRefreshSeq > prevLocalRefreshRef.current) {
      prevLocalRefreshRef.current = localRefreshSeq;
      if (showLocalRef.current) local.refresh();
    }
  }, [local, localRefreshSeq, showLocalRef]);

  const handleCopyPath = useCallback(
    (path: string) => void copyText(path).then(() => alert.info(t("sftp.copied"), TOAST_COPY_MS)),
    [alert, t]
  );

  const requestDelete = useCallback(
    (targetKind: "local" | "remote", paths: string[]) => {
      if (
        paths.length === 0 ||
        (targetKind === "remote" && connStateRef.current !== "CONNECTED")
      ) {
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
    [connStateRef, local, onConfirmDelete, remote, t, tab.tabId]
  );

  const openFileInTab = useCallback(
    (kind: "local" | "remote", path: string, name: string) => {
      if (kind === "remote" && connStateRef.current !== "CONNECTED") return;
      useTabsStore.getState().openEditorTab(
        {
          kind,
          path,
          name,
          hostLabel: kind === "remote" ? hostLabel : t("sftp.local_pane"),
        },
        tab.hostId,
        kind === "remote"
          ? {
              canAutoReconnect: tab.canAutoReconnect,
              autoReconnect: tab.autoReconnect,
              reconnectIntervalSec: tab.reconnectIntervalSec,
            }
          : undefined
      );
    },
    [
      connStateRef,
      hostLabel,
      t,
      tab.autoReconnect,
      tab.canAutoReconnect,
      tab.hostId,
      tab.reconnectIntervalSec,
    ]
  );

  const handleOpenFile = useCallback(
    (kind: "local" | "remote", item: FileItem) => {
      if (item.isDir) return;
      openFileInTab(kind, item.path, item.name);
    },
    [openFileInTab]
  );

  const handleNameSubmit = useCallback(
    async (name: string) => {
      if (!nameModal) return;
      if (nameModal.kind === "newfile") {
        if (nameModal.targetKind === "remote") {
          const createdPath = await sftpApi.sftpCreateFile(tab.tabId, remote.cwd, name);
          remote.refresh([name]);
          setNameModal(null);
          openFileInTab("remote", createdPath, name);
          return;
        }
        const createdPath = await localFsApi.localCreateFile(local.cwd, name);
        local.refresh([name]);
        setNameModal(null);
        openFileInTab("local", createdPath, name);
        return;
      }
      if (nameModal.kind === "mkdir") {
        if (nameModal.targetKind === "remote") {
          await sftpApi.sftpCreateDir(tab.tabId, remote.cwd, name);
          remote.refresh([name]);
        } else {
          await localFsApi.localCreateDir(local.cwd, name);
          local.refresh([name]);
        }
      } else if (nameModal.targetKind === "remote") {
        await sftpApi.sftpRename(tab.tabId, nameModal.item.path, name);
        remote.refresh([name]);
      } else {
        await localFsApi.localRename(nameModal.item.path, name);
        local.refresh([name]);
      }
      setNameModal(null);
    },
    [local, nameModal, openFileInTab, remote, tab.tabId]
  );

  const handleConfirmChmod = useCallback(
    async (nextMode: number) => {
      if (!chmodItem) return;
      try {
        await sftpApi.sftpChmod(tab.tabId, chmodItem.path, nextMode);
        remote.refresh();
      } catch (err) {
        notifyError(err);
      }
    },
    [chmodItem, notifyError, remote, tab.tabId]
  );

  return {
    nameModal,
    setNameModal,
    chmodItem,
    setChmodItem,
    handleCopyPath,
    requestDelete,
    handleOpenFile,
    handleNameSubmit,
    handleConfirmChmod,
  };
}
