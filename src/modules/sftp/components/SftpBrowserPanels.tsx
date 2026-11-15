import React from "react";
import { Download, FolderPlus, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { ContextMenuEntry } from "@/shared/ui";
import type { DirectoryBrowser } from "../hooks/useDirectoryBrowser";
import type { useSftpFileDrag } from "../hooks/useSftpFileDrag";
import { buildPaneMenu } from "../menus/sftpMenus";
import type { FileItem, LocalDriveDto } from "../types";
import { FileList } from "./FileList";
import type { NamePromptState } from "./SftpOverlays";

interface SftpBrowserPanelsProps {
  containerRef: React.RefObject<HTMLDivElement>;
  remoteDropRef: React.RefObject<HTMLDivElement>;
  activePaneRef: React.MutableRefObject<"local" | "remote">;
  showLocal: boolean;
  splitRatio: number;
  connected: boolean;
  nativeDragActive: boolean;
  local: DirectoryBrowser;
  remote: DirectoryBrowser;
  localDrives: LocalDriveDto[];
  fileDrag: ReturnType<typeof useSftpFileDrag>;
  onResetSplit: () => void;
  onStartSplitDrag: (e: React.MouseEvent) => void;
  onShowMenu: (x: number, y: number, items: ContextMenuEntry[]) => void;
  onNamePrompt: (prompt: NamePromptState) => void;
  onChmod: (item: FileItem) => void;
  onCopyPath: (path: string) => void;
  onRequestDelete: (kind: "local" | "remote", paths: string[]) => void;
  onRequestUpload: (paths: string[]) => void;
  onRequestDownload: (paths: string[]) => void;
  onUploadDialog: (directory: boolean) => void;
}

export const SftpBrowserPanels: React.FC<SftpBrowserPanelsProps> = ({
  containerRef,
  remoteDropRef,
  activePaneRef,
  showLocal,
  splitRatio,
  connected,
  nativeDragActive,
  local,
  remote,
  localDrives,
  fileDrag,
  onResetSplit,
  onStartSplitDrag,
  onShowMenu,
  onNamePrompt,
  onChmod,
  onCopyPath,
  onRequestDelete,
  onRequestUpload,
  onRequestDownload,
  onUploadDialog,
}) => {
  const { t } = useI18n();

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
    onUp: browser.goUp,
    onHome: browser.goHome,
    onRefresh: browser.refresh,
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
              title={t("sftp.local_pane")}
              drives={localDrives}
              dropActive={fileDrag.dragPreview?.targetKind === "local"}
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
                    onTransfer: onRequestUpload,
                    onNewFolder: () => onNamePrompt({ kind: "mkdir", targetKind: "local" }),
                    onRename: (it) =>
                      onNamePrompt({ kind: "rename", targetKind: "local", item: it }),
                    onCopyPath,
                    onDelete: (paths) => onRequestDelete("local", paths),
                    onRefresh: local.refresh,
                  })
                )
              }
              actions={
                <button
                  type="button"
                  disabled={local.selected.length === 0 || !connected}
                  onClick={() => onRequestUpload(local.selected)}
                  className="inline-flex h-6 items-center gap-1 rounded border border-[#388bfd]/50 bg-[#1f6feb]/20 px-2 text-[11px] font-medium text-[#58a6ff] hover:bg-[#1f6feb]/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Upload className="h-3 w-3" />
                  <span>{t("sftp.upload_selected")}</span>
                </button>
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
          title={t("sftp.remote_pane")}
          showPerms
          dropActive={nativeDragActive || fileDrag.dragPreview?.targetKind === "remote"}
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
                onTransfer: onRequestDownload,
                onUploadFiles: () => onUploadDialog(false),
                onUploadFolder: () => onUploadDialog(true),
                onNewFolder: () => onNamePrompt({ kind: "mkdir", targetKind: "remote" }),
                onRename: (it) =>
                  onNamePrompt({ kind: "rename", targetKind: "remote", item: it }),
                onChmod,
                onCopyPath,
                onDelete: (paths) => onRequestDelete("remote", paths),
                onRefresh: remote.refresh,
              })
            )
          }
          actions={
            showLocal ? (
              <button
                type="button"
                disabled={remote.selected.length === 0 || !connected}
                onClick={() => onRequestDownload(remote.selected)}
                className="inline-flex h-6 items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3 w-3" />
                <span>{t("sftp.download_selected")}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!connected}
                  onClick={() => onUploadDialog(false)}
                  title={t("sftp.upload_files")}
                  className="inline-flex h-6 items-center gap-1 rounded border border-[#30363d] bg-[#0d1117] px-2 text-[11px] text-[#c9d1d9] hover:border-[#388bfd] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Upload className="h-3 w-3" />
                  <span>{t("sftp.upload_files")}</span>
                </button>
                <button
                  type="button"
                  disabled={!connected}
                  onClick={() => onUploadDialog(true)}
                  title={t("sftp.upload_folder")}
                  className="inline-flex h-6 items-center gap-1 rounded border border-[#30363d] bg-[#0d1117] px-2 text-[11px] text-[#c9d1d9] hover:border-[#388bfd] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>{t("sftp.upload_folder")}</span>
                </button>
              </>
            )
          }
        />
      </div>
    </div>
  );
};
