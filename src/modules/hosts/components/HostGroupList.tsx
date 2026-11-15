import React from "react";
import { ChevronDown, ChevronRight, Folder, GripVertical, Server } from "lucide-react";
import type { HostProfileSummaryDto } from "../types";
import type { HostDragPreview } from "../hooks/useHostDrag";
import type { GroupDragPreview } from "../hooks/useGroupDrag";
import { useI18n } from "@/shared/i18n";
import { HostCard } from "./HostCard";

interface HostGroupListProps {
  listScrollRef: React.RefObject<HTMLDivElement>;
  groupElsRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  groupedProfiles: Array<[string, HostProfileSummaryDto[]]>;
  collapsedGroups: Record<string, boolean>;
  dragPreview: HostDragPreview | null;
  groupDragPreview: GroupDragPreview | null;
  canReorderGroups: boolean;
  suppressDblClickRef: React.MutableRefObject<boolean>;
  suppressGroupClickRef: React.MutableRefObject<boolean>;
  onToggleGroup: (group: string, currentCollapsed: boolean) => void;
  onPointerDownGroup: (
    e: React.PointerEvent<HTMLButtonElement>,
    groupName: string,
    count: number
  ) => void;
  onPointerDownHost: (
    e: React.PointerEvent<HTMLDivElement>,
    host: HostProfileSummaryDto,
    groupName: string
  ) => void;
  onSelectHost: (host: HostProfileSummaryDto) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
  onDuplicateHost: (host: HostProfileSummaryDto) => void;
  onEditHost: (hostId: string) => void;
  onDeleteHost: (host: HostProfileSummaryDto) => void;
  onContextMenuHost?: (e: React.MouseEvent, host: HostProfileSummaryDto) => void;
  onContextMenuGroup?: (e: React.MouseEvent, groupName: string) => void;
}

const DropInsertLine: React.FC<{ pos: string }> = ({ pos }) => (
  <div className={`pointer-events-none absolute left-1 right-1 ${pos} z-20 flex items-center`}>
    <span className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-sky-400 shrink-0" />
    <span className="h-[2px] flex-1 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]" />
  </div>
);

export const HostGroupList: React.FC<HostGroupListProps> = ({
  listScrollRef,
  groupElsRef,
  groupedProfiles,
  collapsedGroups,
  dragPreview,
  groupDragPreview,
  canReorderGroups,
  suppressDblClickRef,
  suppressGroupClickRef,
  onToggleGroup,
  onPointerDownGroup,
  onPointerDownHost,
  onSelectHost,
  onOpenSftp,
  onDuplicateHost,
  onEditHost,
  onDeleteHost,
  onContextMenuHost,
  onContextMenuGroup,
}) => {
  const { t } = useI18n();

  return (
    <div ref={listScrollRef} className="flex-1 overflow-y-auto p-1">
      {groupedProfiles.length === 0 ? (
        <div className="text-center py-10 px-4">
          <Server className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">{t("host.empty")}</p>
        </div>
      ) : (
        groupedProfiles.map(([groupName, items], index) => {
          const groupKey = groupName.trim().toLowerCase();
          const isCollapsed = collapsedGroups[groupKey] ?? items.length === 0;
          const isDropTarget =
            !!dragPreview &&
            dragPreview.overGroup?.toLowerCase() === groupKey &&
            dragPreview.sourceGroup.toLowerCase() !== groupKey;
          const isGroupDragged =
            groupDragPreview?.groupName.toLowerCase() === groupKey;
          const showLineBefore = groupDragPreview?.insertIndex === index;
          const showLineAfter =
            index === groupedProfiles.length - 1 &&
            groupDragPreview?.insertIndex === groupedProfiles.length;

          return (
            <div
              key={groupName}
              ref={(el) => {
                if (el) groupElsRef.current.set(groupName, el);
                else groupElsRef.current.delete(groupName);
              }}
              onContextMenu={(e) => {
                if (!onContextMenuGroup) return;
                e.preventDefault();
                e.stopPropagation();
                onContextMenuGroup(e, groupName);
              }}
              // Keep fixed p-1 padding so drop-target highlight never expands group height.
              className={`relative space-y-1 p-1 rounded-lg transition-colors ${
                isDropTarget ? "bg-sky-500/10 ring-1 ring-inset ring-sky-400/75" : ""
              } ${isGroupDragged ? "opacity-45" : ""}`}
            >
              {showLineBefore && <DropInsertLine pos="-top-px" />}
              {showLineAfter && <DropInsertLine pos="-bottom-px" />}

              <button
                type="button"
                onPointerDown={(e) => onPointerDownGroup(e, groupName, items.length)}
                onClick={() => {
                  if (suppressGroupClickRef.current) return;
                  onToggleGroup(groupName, isCollapsed);
                }}
                className={`group/hdr w-full flex items-center justify-between px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  isDropTarget
                    ? "text-sky-200 bg-sky-500/15"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {canReorderGroups && (
                    <GripVertical className="w-3 h-3 text-slate-600 group-hover/hdr:text-slate-400 cursor-grab shrink-0 -ml-1 transition-colors" />
                  )}
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <Folder className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                  <span className="truncate">{groupName}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">
                  {items.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="space-y-1 pl-2">
                  {items.length === 0 ? (
                    <div
                      className={`px-3 py-2.5 rounded-md border border-dashed text-[11px] text-center transition-colors ${
                        isDropTarget
                          ? "border-sky-400 text-sky-300 bg-sky-500/10"
                          : dragPreview
                          ? "border-slate-700 text-slate-400 bg-slate-950/40"
                          : "border-slate-800/80 text-slate-500 bg-slate-950/30"
                      }`}
                    >
                      {t("group.empty_drop_hint")}
                    </div>
                  ) : (
                    items.map((host) => (
                      <HostCard
                        key={host.id}
                        host={host}
                        groupName={groupName}
                        isDragging={dragPreview?.host.id === host.id}
                        onPointerDown={onPointerDownHost}
                        onConnect={onSelectHost}
                        onOpenSftp={onOpenSftp}
                        onDuplicate={onDuplicateHost}
                        onEdit={onEditHost}
                        onDelete={onDeleteHost}
                        onContextMenu={onContextMenuHost}
                        shouldSuppressDblClick={() => suppressDblClickRef.current}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
