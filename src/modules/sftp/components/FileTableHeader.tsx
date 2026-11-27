import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { useWindowMouseDrag } from "@/shared/hooks/useWindowMouseDrag";
import {
  COL_PAIRS,
  computeDefaultCols,
  fitColumns,
  type ColEdge,
  type ColWidths,
  type SortDir,
  type SortKey,
} from "../hooks/fileListUtils";

export function useTableColumns(
  tableWrapRef: React.RefObject<HTMLDivElement>,
  showPerms: boolean
) {
  const [colRatios, setColRatios] = useState<ColWidths | null>(null);
  const [activeColDrag, setActiveColDrag] = useState<ColEdge | null>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  const colDragActiveRef = useRef(false);
  const startMouseDrag = useWindowMouseDrag();

  useLayoutEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    let prevWidth = Math.round(el.clientWidth);
    setWrapWidth(prevWidth);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const w = Math.round(entry ? entry.contentRect.width : el.clientWidth);
      if (Math.abs(w - prevWidth) > 1) {
        prevWidth = w;
        setWrapWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tableWrapRef]);

  const widths = useMemo(() => {
    if (wrapWidth <= 0) return null;
    if (colRatios) {
      return fitColumns(
        {
          name: colRatios.name * wrapWidth,
          size: colRatios.size * wrapWidth,
          mtime: colRatios.mtime * wrapWidth,
          perms: showPerms ? colRatios.perms * wrapWidth : 0,
        },
        wrapWidth
      );
    }
    return computeDefaultCols(wrapWidth, showPerms);
  }, [wrapWidth, colRatios, showPerms]);

  const startColDrag = (edge: ColEdge, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!widths || wrapWidth <= 0) return;
    colDragActiveRef.current = true;
    setActiveColDrag(edge);
    const startX = e.clientX;
    const start = { ...widths };
    const total = wrapWidth;
    const pair = COL_PAIRS[edge];
    const effMinLeft = Math.min(pair.minLeft, start[pair.left]);
    const effMinRight = Math.min(pair.minRight, start[pair.right]);

    startMouseDrag({
      cursor: "col-resize",
      onMove: (ev) => {
        const dx = ev.clientX - startX;
        const clamped = Math.max(
          effMinLeft - start[pair.left],
          Math.min(start[pair.right] - effMinRight, dx)
        );
        const next: ColWidths = {
          ...start,
          [pair.left]: start[pair.left] + clamped,
          [pair.right]: start[pair.right] - clamped,
        };
        setColRatios({
          name: next.name / total,
          size: next.size / total,
          mtime: next.mtime / total,
          perms: showPerms ? next.perms / total : 0,
        });
      },
      onEnd: () => {
        setActiveColDrag(null);
        window.setTimeout(() => {
          colDragActiveRef.current = false;
        }, 0);
      },
    });
  };

  return {
    widths,
    activeColDrag,
    colDragActiveRef,
    startColDrag,
    resetCols: () => setColRatios(null),
  };
}

function ColDivider({
  edge,
  active,
  onDragStart,
  onReset,
}: {
  edge: ColEdge;
  active: boolean;
  onDragStart: (edge: ColEdge, e: React.MouseEvent) => void;
  onReset: () => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={(e) => onDragStart(edge, e)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      className="group/sep absolute -right-1.5 top-0 bottom-0 z-20 flex w-3 cursor-col-resize items-center justify-center"
    >
      <span
        className={`rounded-full transition-colors ${
          active
            ? "h-4 w-[2px] bg-[#58a6ff]"
            : "h-3.5 w-[1.5px] bg-[#484f58] group-hover/sep:h-4 group-hover/sep:w-[2px] group-hover/sep:bg-[#58a6ff]"
        }`}
      />
    </span>
  );
}

export const FileColGroup: React.FC<{ widths: ColWidths | null; showPerms: boolean }> = ({
  widths,
  showPerms,
}) => (
  <colgroup>
    <col style={{ width: widths ? `${widths.name}px` : showPerms ? "36%" : "48%" }} />
    <col style={{ width: widths ? `${widths.size}px` : showPerms ? "22%" : "24%" }} />
    <col style={{ width: widths ? `${widths.mtime}px` : showPerms ? "22%" : "28%" }} />
    {showPerms && <col style={{ width: widths ? `${widths.perms}px` : "20%" }} />}
  </colgroup>
);

interface FileTableHeaderProps {
  showPerms: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  activeColDrag: ColEdge | null;
  onToggleSort: (key: SortKey) => void;
  onStartColDrag: (edge: ColEdge, e: React.MouseEvent) => void;
  onResetCols: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const FileTableHeader: React.FC<FileTableHeaderProps> = ({
  showPerms,
  sortKey,
  sortDir,
  activeColDrag,
  onToggleSort,
  onStartColDrag,
  onResetCols,
  onContextMenu,
}) => {
  const { t } = useI18n();

  const cols = [
    { key: "name" as const, label: t("sftp.col_name"), align: "left", edge: "name-size" as const, pad: "px-3" },
    { key: "size" as const, label: t("sftp.col_size"), align: "right", edge: "size-mtime" as const, pad: "px-2.5" },
    {
      key: "mtime" as const,
      label: t("sftp.col_modified"),
      align: "left",
      edge: showPerms ? ("mtime-perms" as const) : null,
      pad: "px-2.5",
    },
  ];

  return (
    <thead
      onContextMenu={onContextMenu}
      className="sticky top-0 z-10 bg-[#0d1117] text-[10px] font-semibold uppercase tracking-wide text-[#8b949e]"
    >
      <tr>
        {cols.map((col) => (
          <th key={col.key} className="border-b border-[#21262d] p-0 select-none">
            <div
              onClick={() => onToggleSort(col.key)}
              className={`relative flex w-full cursor-pointer items-center py-1.5 hover:text-[#e6edf3] ${col.pad} ${
                col.align === "right" ? "justify-end" : "justify-start"
              }`}
            >
              <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                <span className="truncate">{col.label}</span>
                {sortKey === col.key &&
                  (sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3 shrink-0" />
                  ) : (
                    <ArrowDown className="h-3 w-3 shrink-0" />
                  ))}
              </span>
              {col.edge && (
                <ColDivider
                  edge={col.edge}
                  active={activeColDrag === col.edge}
                  onDragStart={onStartColDrag}
                  onReset={onResetCols}
                />
              )}
            </div>
          </th>
        ))}
        {showPerms && (
          <th className="border-b border-[#21262d] p-0 select-none">
            <div className="truncate whitespace-nowrap px-2.5 py-1.5">{t("sftp.col_perms")}</div>
          </th>
        )}
      </tr>
    </thead>
  );
};
