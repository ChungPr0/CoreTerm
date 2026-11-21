import React, { useMemo, useRef, useState } from "react";
import { File, FileSymlink, Folder, RefreshCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { fmtMode, fmtSize, fmtTime } from "@/shared/utils/formatters";
import type { FileItem, LocalDriveDto } from "../types";
import { sortAndFilterItems, type SortDir, type SortKey } from "../hooks/fileListUtils";
import { useFileSelection } from "../hooks/useFileSelection";
import { FileListHeader } from "./FileListHeader";
import { FileColGroup, FileTableHeader, useTableColumns } from "./FileTableHeader";

export type { FileItem };

interface FileListProps {
  kind: "local" | "remote";
  title: string;
  cwd: string;
  items: FileItem[];
  loading: boolean;
  selected: string[];
  showPerms?: boolean;
  filter: string;
  drives?: LocalDriveDto[];
  actions?: React.ReactNode;
  dropActive?: boolean;
  dropLabel?: string;
  emptyMessage?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onChangeFilter: (v: string) => void;
  onSelect: (paths: string[]) => void;
  onNavigate: (path: string) => void;
  onBack?: () => void;
  onForward?: () => void;
  onActivatePane?: () => void;
  onUp: () => void;
  onHome: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onRenameItem: (item: FileItem) => void;
  onDeletePaths: (paths: string[]) => void;
  onContextMenuItem: (item: FileItem | null, e: React.MouseEvent) => void;
  onStartRowDrag?: (
    item: FileItem,
    dragPaths: string[],
    e: React.PointerEvent<HTMLTableRowElement>
  ) => void;
  shouldSuppressRowClick?: () => boolean;
}

export const FileList: React.FC<FileListProps> = ({
  kind,
  title,
  cwd,
  items,
  loading,
  selected,
  showPerms = false,
  filter,
  drives,
  actions,
  dropActive = false,
  dropLabel,
  emptyMessage,
  canGoBack = false,
  canGoForward = false,
  onChangeFilter,
  onSelect,
  onNavigate,
  onBack,
  onForward,
  onActivatePane,
  onUp,
  onHome,
  onRefresh,
  onNewFolder,
  onRenameItem,
  onDeletePaths,
  onContextMenuItem,
  onStartRowDrag,
  shouldSuppressRowClick,
}) => {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const { widths, activeColDrag, colDragActiveRef, startColDrag, resetCols } = useTableColumns(
    tableWrapRef,
    showPerms
  );

  const visibleItems = useMemo(
    () => sortAndFilterItems(items, filter, sortKey, sortDir),
    [items, filter, sortKey, sortDir]
  );

  const { selectedSet, handleRowClick, handleContainerKeyDown } = useFileSelection({
    visibleItems,
    selected,
    onSelect,
    onNavigate,
    onBack,
    onForward,
    onUp,
    onRenameItem,
    onDeletePaths,
  });

  const toggleSort = (key: SortKey) => {
    if (colDragActiveRef.current) return;
    if (sortKey === key) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div
      tabIndex={0}
      data-sftp-pane={kind}
      onMouseEnter={onActivatePane}
      onFocusCapture={onActivatePane}
      onKeyDown={handleContainerKeyDown}
      className="relative flex min-h-0 min-w-0 flex-1 select-none flex-col bg-[#0d1117] outline-none"
    >
      <FileListHeader
        kind={kind}
        title={title}
        cwd={cwd}
        loading={loading}
        filter={filter}
        drives={drives}
        actions={actions}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onChangeFilter={onChangeFilter}
        onNavigate={onNavigate}
        onBack={onBack}
        onForward={onForward}
        onUp={onUp}
        onHome={onHome}
        onRefresh={onRefresh}
        onNewFolder={onNewFolder}
      />

      <div
        ref={tableWrapRef}
        style={{ scrollbarGutter: "stable" }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !shouldSuppressRowClick?.()) onSelect([]);
        }}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          e.stopPropagation();
          onSelect([]);
          onContextMenuItem(null, e);
        }}
      >
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-xs">
          <FileColGroup widths={widths} showPerms={showPerms} />
          <FileTableHeader
            showPerms={showPerms}
            sortKey={sortKey}
            sortDir={sortDir}
            activeColDrag={activeColDrag}
            onToggleSort={toggleSort}
            onStartColDrag={startColDrag}
            onResetCols={resetCols}
          />
          <tbody>
            {visibleItems.map((item, idx) => {
              const isSelected = selectedSet.has(item.path);
              return (
                <tr
                  key={item.path}
                  onPointerDown={(e) => {
                    onStartRowDrag?.(item, isSelected ? selected : [item.path], e);
                  }}
                  onMouseDown={(e) => {
                    if (e.detail > 1) {
                      e.preventDefault();
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.detail >= 2 && item.isDir) {
                      onNavigate(item.path);
                      return;
                    }
                    if (!shouldSuppressRowClick?.()) handleRowClick(item, idx, e);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (item.isDir) onNavigate(item.path);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isSelected) onSelect([item.path]);
                    onContextMenuItem(item, e);
                  }}
                  className={`cursor-pointer select-none ${
                    isSelected
                      ? "bg-[#1f6feb]/25 text-[#e6edf3]"
                      : "text-[#c9d1d9] hover:bg-[#161b22]"
                  }`}
                >
                  <td className="border-b border-[#161b22]/70 px-3 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.isDir ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      ) : item.isSymlink ? (
                        <FileSymlink className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      ) : (
                        <File className="h-3.5 w-3.5 shrink-0 text-[#8b949e]" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>
                  </td>
                  <td className="border-b border-[#161b22]/70 px-2.5 py-1.5 text-right font-mono text-[11px] text-[#8b949e]">
                    <div className="truncate">{item.isDir ? "-" : fmtSize(item.size)}</div>
                  </td>
                  <td className="border-b border-[#161b22]/70 px-2.5 py-1.5 font-mono text-[11px] text-[#8b949e]">
                    <div className="truncate">{fmtTime(item.mtimeMs)}</div>
                  </td>
                  {showPerms && (
                    <td className="border-b border-[#161b22]/70 px-2.5 py-1.5 font-mono text-[11px] text-[#8b949e]">
                      <div className="truncate">
                        {item.perms || "-"}
                        {item.mode != null && (
                          <span className="ml-1 text-[#6e7681]">({fmtMode(item.mode)})</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading && visibleItems.length === 0 && (
          <div className="flex h-36 flex-col items-center justify-center gap-2.5 text-xs text-[#8b949e]">
            <RefreshCw className="h-5 w-5 animate-spin text-[#58a6ff]" />
            <span>{emptyMessage || t("common.loading")}</span>
          </div>
        )}

        {!loading && visibleItems.length === 0 && (
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect([]);
              onContextMenuItem(null, e);
            }}
            className="flex h-32 items-center justify-center text-xs text-[#6e7681]"
          >
            {emptyMessage || t("sftp.empty_dir")}
          </div>
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-[#21262d] bg-[#0b1016] px-3 text-[11px] text-[#8b949e]">
        <span>{t("sftp.items_count", { count: visibleItems.length })}</span>
        {selected.length > 0 && (
          <span className="text-[#58a6ff]">{t("sftp.selected_count", { count: selected.length })}</span>
        )}
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-[#388bfd] bg-[#1f6feb]/15">
          <div className="rounded-md border border-[#388bfd] bg-[#0d1117]/95 px-4 py-2 text-xs font-medium text-[#e6edf3] shadow-lg">
            {dropLabel || t("sftp.drop_hint")}
          </div>
        </div>
      )}
    </div>
  );
};
