import React from "react";
import { Download, FolderPlus, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, type ContextMenuEntry } from "@/shared/ui";
import type { DirectoryBrowser } from "../hooks/useDirectoryBrowser";
import type { useSftpFileDrag } from "../hooks/useSftpFileDrag";
import { buildPaneMenu } from "../menus/sftpMenus";
import type { FileItem, LocalDriveDto, SftpConnectionState } from "../types";
import { FileList } from "./FileList";
import type { NamePromptState } from "./SftpOverlays";

interface SftpBrowserPanelsProps {
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
}

export const SftpBrowserPanels: React.FC<SftpBrowserPanelsProps> = ({
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
              onContextMenuItem={(item, e) =>
                onShowMenu(
                  e.clientX,
                  e.clientY,
                  buildPaneMenu({
                    kind: "local",
                    cwd: local.cwd,
                    item,
                    selected: local.selected,
                    connected,
                    showLocal,
                    t,
                    onOpenDir: (p) => void local.loadDir(p),
                    onEditFile: (it) => onOpenFile("local", it),
                    onTransfer: onRequestUpload,
                    onNewFile: () => onNamePrompt({ kind: "newfile", targetKind: "local" }),
                    onNewFolder: () => onNamePrompt({ kind: "mkdir", targetKind: "local" }),
                    onRename: (it) =>
                      onNamePrompt({ kind: "rename", targetKind: "local", item: it }),
                    onCopyPath,
                    onDelete: (paths) => onRequestDelete("local", paths),
                    onRefresh: refreshLocal,
                  })
                )
              }
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
          onContextMenuItem={(item, e) =>
            onShowMenu(
              e.clientX,
              e.clientY,
              buildPaneMenu({
                kind: "remote",
                cwd: remote.cwd,
                item,
                selected: remote.selected,
                connected,
                showLocal,
                t,
                onOpenDir: (p) => void remote.loadDir(p),
                onEditFile: (it) => onOpenFile("remote", it),
                onTransfer: onRequestDownload,
                onUploadFiles: () => onUploadDialog(false),
                onUploadFolder: () => onUploadDialog(true),
                onNewFile: () => onNamePrompt({ kind: "newfile", targetKind: "remote" }),
                onNewFolder: () => onNamePrompt({ kind: "mkdir", targetKind: "remote" }),
                onRename: (it) =>
                  onNamePrompt({ kind: "rename", targetKind: "remote", item: it }),
                onChmod,
                onCopyPath,
                onDelete: (paths) => onRequestDelete("remote", paths),
                onRefresh: refreshRemote,
              })
            )
          }
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
