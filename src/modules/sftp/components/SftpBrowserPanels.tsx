import React from "react";
import { Download, FolderPlus, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, type ContextMenuEntry } from "@/shared/ui";
import type { DirectoryBrowser } from "../hooks/useDirectoryBrowser";
import type { useSftpFileDrag } from "../hooks/useSftpFileDrag";
import {
  buildColumnHeaderMenu,
  buildPaneMenu,
  buildSplitDividerMenu,
} from "../menus/sftpMenus";
import type { FileItem, LocalDriveDto, SftpConnectionState } from "../types";
import { FileList, type FilePaneContextMeta } from "./FileList";
import type { NamePromptState } from "./SftpOverlays";

interface SftpBrowserPanelsProps {
  mode: "split" | "full";
  containerRef: React.RefObject<HTMLDivElement>;
  remoteDropRef: React.RefObject<HTMLDivElement>;
  activePaneRef: React.MutableRefObject<"local" | "remote">;
  showLocal: boolean;
  splitRatio: number;
  connState: SftpConnectionState;
  connected: boolean;
  nativeDragActive: boolean;
  local: DirectoryBrowser;
  remote: DirectoryBrowser;
  localDrives: LocalDriveDto[];
  remoteDrives: LocalDriveDto[];
  fileDrag: ReturnType<typeof useSftpFileDrag>;
  onResetSplit: () => void;
  onStartSplitDrag: (e: React.MouseEvent) => void;
  onToggleLocalPane: () => void;
  onOpenInTerminal?: (remotePath: string) => void;
  onShowMenu: (x: number, y: number, items: ContextMenuEntry[]) => void;
  onNamePrompt: (prompt: NamePromptState) => void;
  onOpenFile: (kind: "local" | "remote", item: FileItem) => void;
  onChmod: (item: FileItem) => void;
  onCopyPath: (path: string) => void;
  onRequestDelete: (kind: "local" | "remote", paths: string[]) => void;
  onRequestUpload: (paths: string[]) => void;
  onRequestDownload: (paths: string[]) => void;
  onUploadDialog: (directory: boolean) => void;
  onReloadLocal: () => void;
  onRefreshLocalDrives?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export const SftpBrowserPanels: React.FC<SftpBrowserPanelsProps> = ({
  mode,
  containerRef,
  remoteDropRef,
  activePaneRef,
  showLocal,
  splitRatio,
  connState,
  connected,
  nativeDragActive,
  local,
  remote,
  localDrives,
  remoteDrives,
  fileDrag,
  onResetSplit,
  onStartSplitDrag,
  onToggleLocalPane,
  onOpenInTerminal,
  onShowMenu,
  onNamePrompt,
  onOpenFile,
  onChmod,
  onCopyPath,
  onRequestDelete,
  onRequestUpload,
  onRequestDownload,
  onUploadDialog,
  onReloadLocal,
  onRefreshLocalDrives,
  onOpenSettings,
  onClose,
}) => {
  const { t } = useI18n();

  const refreshLocal = () => {
    onReloadLocal();
  };

  const refreshRemote = () => {
    if (remote.cwdRef.current || remote.homeRef.current) remote.refresh();
    else if (connected) void remote.loadDir("/");
  };

  const remoteEmptyMessage =
    connState === "CONNECTING"
      ? t("sftp.connecting")
      : !connected
      ? t("sftp.disconnected")
      : undefined;

  const sharedProps = (kind: "local" | "remote", browser: DirectoryBrowser) => ({
    kind,
    cwd: browser.cwd,
    items: browser.items,
    loading: browser.loading,
    selected: browser.selected,
    filter: browser.filter,
    canGoBack: browser.canGoBack,
    canGoForward: browser.canGoForward,
    onBack: () => browser.goHistory(-1),
    onForward: () => browser.goHistory(1),
    onActivatePane: () => {
      activePaneRef.current = kind;
    },
    onChangeFilter: browser.setFilter,
    onSelect: browser.setSelected,
    onNavigate: (p: string) => void browser.loadDir(p),
    onOpenFile: (item: FileItem) => onOpenFile(kind, item),
    onUp: browser.goUp,
    onHome: browser.goHome,
    onRefresh: browser.refresh,
    onNewFile: () => onNamePrompt({ kind: "newfile", targetKind: kind }),
    onNewFolder: () => onNamePrompt({ kind: "mkdir", targetKind: kind }),
    onRenameItem: (item: FileItem) => onNamePrompt({ kind: "rename", targetKind: kind, item }),
    onDeletePaths: (paths: string[]) => onRequestDelete(kind, paths),
    onStartRowDrag: (
      item: FileItem,
      dragPaths: string[],
      e: React.PointerEvent<HTMLTableRowElement>
    ) => fileDrag.startDrag(kind, dragPaths, item.name, e),
    shouldSuppressRowClick: fileDrag.shouldSuppressClick,
  });

  const makeItemContextHandler =
    (
      kind: "local" | "remote",
      browser: DirectoryBrowser,
      onRefreshPane: () => void,
      onTransfer: (paths: string[]) => void
    ) =>
    (item: FileItem | null, e: React.MouseEvent, meta: FilePaneContextMeta) => {
      onShowMenu(
        e.clientX,
        e.clientY,
        buildPaneMenu({
          kind,
          mode,
          cwd: browser.cwd,
          item,
          selected: browser.selected,
          hasItems: meta.hasItems,
          connected,
          showLocal,
          t,
          onOpenDir: (p) => void browser.loadDir(p),
          onEditFile: (it) => onOpenFile(kind, it),
          onTransfer,
          ...(kind === "remote"
            ? {
                onUploadFiles: () => onUploadDialog(false),
                onUploadFolder: () => onUploadDialog(true),
                onChmod,
                onOpenInTerminal,
              }
            : {}),
          onNewFile: () => onNamePrompt({ kind: "newfile", targetKind: kind }),
          onNewFolder: () => onNamePrompt({ kind: "mkdir", targetKind: kind }),
          onRename: (it) => onNamePrompt({ kind: "rename", targetKind: kind, item: it }),
          onCopyPath,
          onSelectAll: meta.onSelectAll,
          onClearSelection: meta.onClearSelection,
          onDelete: (paths) => onRequestDelete(kind, paths),
          onRefresh: onRefreshPane,
          onOpenSettings,
          onClose,
        })
      );
    };

  const makeColumnsContextHandler =
    (kind: "local" | "remote", onRefreshPane: () => void) =>
    (e: React.MouseEvent, meta: FilePaneContextMeta) => {
      onShowMenu(
        e.clientX,
        e.clientY,
        buildColumnHeaderMenu({
          kind,
          connected,
          sortKey: meta.sortKey,
          sortDir: meta.sortDir,
          t,
          onSort: meta.onSort,
          onResetCols: meta.onResetCols,
          onRefresh: onRefreshPane,
        })
      );
    };

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
      {showLocal && (
        <>
          <div
            style={{ width: `${Math.round(splitRatio * 1000) / 10}%` }}
            className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden"
          >
            <FileList
              {...sharedProps("local", local)}
              onRefresh={refreshLocal}
              onRefreshDrives={onRefreshLocalDrives}
              title={t("sftp.local_pane")}
              drives={localDrives}
              dropActive={fileDrag.dragPreview?.targetKind === "local"}
              dropTargetDir={fileDrag.dragPreview?.targetKind === "local" ? fileDrag.dragPreview.targetDir : null}
              dropLabel={t("sftp.drop_to_download")}
              onContextMenuItem={makeItemContextHandler("local", local, refreshLocal, onRequestUpload)}
              onContextMenuColumns={makeColumnsContextHandler("local", refreshLocal)}
              actions={
                <Button
                  variant="outline"
                  size="xs"
                  disabled={local.selected.length === 0 || !connected}
                  onClick={() => onRequestUpload(local.selected)}
                  className="border-sky-500/50 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30"
                  leftIcon={<Upload className="h-3 w-3" />}
                >
                  {t("sftp.upload_selected")}
                </Button>
              }
            />
          </div>

          <div
            onMouseDown={onStartSplitDrag}
            onDoubleClick={onResetSplit}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowMenu(
                e.clientX,
                e.clientY,
                buildSplitDividerMenu({
                  t,
                  onResetSplit,
                  showLocal,
                  onToggleLocalPane,
                })
              );
            }}
            className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-[#30363d]/70 bg-[#161b22] transition-colors hover:border-[#58a6ff] hover:bg-[#1f6feb]/30"
          >
            <div className="h-8 w-0.5 rounded-full bg-[#484f58] transition-colors group-hover:bg-[#58a6ff]" />
          </div>
        </>
      )}

      <div ref={remoteDropRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <FileList
          {...sharedProps("remote", remote)}
          onRefresh={refreshRemote}
          title={t("sftp.remote_pane")}
          drives={remoteDrives}
          showPerms
          emptyMessage={remoteEmptyMessage}
          dropActive={nativeDragActive || fileDrag.dragPreview?.targetKind === "remote"}
          dropTargetDir={fileDrag.dragPreview?.targetKind === "remote" ? fileDrag.dragPreview.targetDir : null}
          dropLabel={nativeDragActive ? t("sftp.drop_hint") : t("sftp.drop_to_upload")}
          onContextMenuItem={makeItemContextHandler("remote", remote, refreshRemote, onRequestDownload)}
          onContextMenuColumns={makeColumnsContextHandler("remote", refreshRemote)}
          actions={
            showLocal ? (
              <Button
                variant="outline"
                size="xs"
                disabled={remote.selected.length === 0 || !connected}
                onClick={() => onRequestDownload(remote.selected)}
                className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                leftIcon={<Download className="h-3 w-3" />}
              >
                {t("sftp.download_selected")}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!connected}
                  onClick={() => onUploadDialog(false)}
                  title={t("sftp.upload_files")}
                  leftIcon={<Upload className="h-3 w-3" />}
                >
                  {t("sftp.upload_files")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!connected}
                  onClick={() => onUploadDialog(true)}
                  title={t("sftp.upload_folder")}
                  leftIcon={<FolderPlus className="h-3.5 w-3.5" />}
                >
                  {t("sftp.upload_folder")}
                </Button>
              </>
            )
          }
        />
      </div>
    </div>
  );
};
