import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Folder,
  KeyRound,
  Lock,
  Plus,
  Search,
  Server,
  Settings,
  Tag,
} from "lucide-react";
import type { HostProfileSummaryDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { getEditableInput } from "@/shared/utils/editableTarget";
import { useHostDrag } from "../hooks/useHostDrag";
import { useGroupDrag } from "../hooks/useGroupDrag";
import { HostGroupList } from "./HostGroupList";

const DRAG_PREVIEW_PILL_CLASS =
  "fixed z-[120] pointer-events-none flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-sky-500/60 shadow-[0_12px_30px_rgba(0,0,0,0.75)] text-xs select-none";

interface HostSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: HostProfileSummaryDto[];
  groups: string[];
  isFiltering?: boolean;
  allTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onConnectHost: (host: HostProfileSummaryDto) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
  onCreateNew: () => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
  onEditHost: (hostId: string) => void;
  onDuplicateHost: (host: HostProfileSummaryDto) => void;
  onDeleteHost: (host: HostProfileSummaryDto) => void;
  onMoveHostToGroup: (hostId: string, targetGroup: string) => void | Promise<void>;
  onReorderGroups: (orderedNames: string[]) => void | Promise<void>;
  onContextMenuHost?: (e: React.MouseEvent, host: HostProfileSummaryDto) => void;
  onContextMenuGroup?: (e: React.MouseEvent, groupName: string) => void;
  onContextMenuSidebar?: (e: React.MouseEvent) => void;
}

export const HostSidebar: React.FC<HostSidebarProps> = ({
  isOpen,
  onClose,
  profiles,
  groups,
  isFiltering = false,
  allTags,
  selectedTag,
  onSelectTag,
  searchQuery,
  onSearchChange,
  onConnectHost,
  onOpenSftp,
  onCreateNew,
  onOpenVault,
  onOpenSettings,
  onEditHost,
  onDuplicateHost,
  onDeleteHost,
  onMoveHostToGroup,
  onReorderGroups,
  onContextMenuHost,
  onContextMenuGroup,
  onContextMenuSidebar,
}) => {
  const { t } = useI18n();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const listScrollRef = useRef<HTMLDivElement>(null);
  const groupElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevGroupCountsRef = useRef<Map<string, number>>(new Map());

  const groupedProfiles = useMemo(() => {
    const map = new Map<string, HostProfileSummaryDto[]>();
    const canonByLower = new Map<string, string>();
    const rankByLower = new Map<string, number>();

    groups.forEach((g, idx) => {
      const key = g.trim().toLowerCase();
      if (key && !rankByLower.has(key)) rankByLower.set(key, idx);
    });

    const ensureGroup = (rawName: string): string => {
      const cleaned = rawName.trim() || "Default";
      const key = cleaned.toLowerCase();
      const existing = canonByLower.get(key);
      if (existing) return existing;
      canonByLower.set(key, cleaned);
      map.set(cleaned, []);
      return cleaned;
    };

    if (!isFiltering) {
      for (const g of groups) ensureGroup(g);
    }
    for (const p of profiles) {
      map.get(ensureGroup(p.group_name || "Default"))!.push(p);
    }

    return Array.from(map.entries()).sort(([a], [b]) => {
      const rankA = rankByLower.get(a.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rankByLower.get(b.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      const aDef = a.toLowerCase() === "default";
      const bDef = b.toLowerCase() === "default";
      if (aDef !== bDef) return aDef ? -1 : 1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [profiles, groups, isFiltering]);

  const groupOrder = useMemo(
    () => groupedProfiles.map(([name]) => name),
    [groupedProfiles]
  );
  const canReorderGroups = !isFiltering && groupOrder.length > 1;

  const { dragPreview, suppressDblClickRef, handleHostPointerDown } = useHostDrag({
    isOpen,
    listScrollRef,
    groupElsRef,
    onDropGroup: (hostId, targetGroup) => {
      const targetKey = targetGroup.trim().toLowerCase();
      setCollapsedGroups((prev) =>
        prev[targetKey] === false ? prev : { ...prev, [targetKey]: false }
      );
      void onMoveHostToGroup(hostId, targetGroup);
    },
  });

  const { groupDragPreview, suppressGroupClickRef, handleGroupPointerDown } =
    useGroupDrag({
      enabled: isOpen && canReorderGroups && !dragPreview,
      groupOrder,
      listScrollRef,
      groupElsRef,
      onReorderGroups: (next) => {
        void onReorderGroups(next);
      },
    });

  useEffect(() => {
    const prevCounts = prevGroupCountsRef.current;
    const nextCounts = new Map<string, number>();
    const clearedEmptyKeys: string[] = [];

    for (const [groupName, items] of groupedProfiles) {
      const key = groupName.trim().toLowerCase();
      nextCounts.set(key, items.length);
      if ((prevCounts.get(key) ?? 0) > 0 && items.length === 0) {
        clearedEmptyKeys.push(key);
      }
    }

    prevGroupCountsRef.current = nextCounts;
    if (clearedEmptyKeys.length > 0) {
      setCollapsedGroups((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of clearedEmptyKeys) {
          if (key in next) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [groupedProfiles]);

  const toggleGroup = (group: string, currentCollapsed: boolean) => {
    const key = group.trim().toLowerCase();
    setCollapsedGroups((prev) => ({ ...prev, [key]: !currentCollapsed }));
  };

  const handleSelectHost = (host: HostProfileSummaryDto) => {
    onConnectHost(host);
    onClose();
  };

  const handleOpenSftp = onOpenSftp
    ? (host: HostProfileSummaryDto) => {
        onOpenSftp(host);
        onClose();
      }
    : undefined;

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-[1px]"
        />
      )}

      <aside
        onContextMenu={(e) => {
          if (getEditableInput(e.target) || !onContextMenuSidebar) return;
          e.preventDefault();
          e.stopPropagation();
          onContextMenuSidebar(e);
        }}
        className={`absolute inset-y-0 left-0 z-40 w-72 bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col select-none transition-transform duration-200 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        <div className="h-11 px-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div
            data-tauri-drag-region="deep"
            className="flex items-center gap-2 flex-1 min-w-0 h-full"
          >
            <div className="w-6 h-6 rounded-md bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Server className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xs font-bold tracking-wide text-slate-100 uppercase truncate">
              {t("app.title")}
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCreateNew}
              title={t("host.create")}
              className="p-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={onOpenVault}
              title={t("vault.title")}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              title={t("settings.title")}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-2.5 border-b border-slate-800/80 space-y-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("host.search")}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950/90 border border-slate-800 rounded-md text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/70"
            />
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
              <Tag className="w-3 h-3 text-slate-500 shrink-0 mr-0.5" />
              <button
                type="button"
                onClick={() => onSelectTag(null)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors ${
                  selectedTag === null
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                {t("host.all_tags")}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors ${
                    selectedTag === tag
                      ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                      : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <HostGroupList
          listScrollRef={listScrollRef}
          groupElsRef={groupElsRef}
          groupedProfiles={groupedProfiles}
          collapsedGroups={collapsedGroups}
          dragPreview={dragPreview}
          groupDragPreview={groupDragPreview}
          canReorderGroups={canReorderGroups}
          suppressDblClickRef={suppressDblClickRef}
          suppressGroupClickRef={suppressGroupClickRef}
          onToggleGroup={toggleGroup}
          onPointerDownGroup={handleGroupPointerDown}
          onPointerDownHost={handleHostPointerDown}
          onSelectHost={handleSelectHost}
          onOpenSftp={handleOpenSftp}
          onDuplicateHost={onDuplicateHost}
          onEditHost={onEditHost}
          onDeleteHost={onDeleteHost}
          onContextMenuHost={onContextMenuHost}
          onContextMenuGroup={onContextMenuGroup}
        />

        <div className="p-2.5 border-t border-slate-800 text-[11px] text-slate-500">
          {t("app.total_hosts")}: {profiles.length}
        </div>
      </aside>

      {dragPreview && (
        <div
          style={{
            left: Math.min(dragPreview.clientX + 12, window.innerWidth - 230),
            top: Math.max(8, Math.min(dragPreview.clientY + 12, window.innerHeight - 44)),
          }}
          className={`${DRAG_PREVIEW_PILL_CLASS} max-w-[220px]`}
        >
          {dragPreview.host.auth_method === "SSH_KEY" ? (
            <KeyRound className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <Lock className="w-3 h-3 text-amber-400 shrink-0" />
          )}
          <span className="font-semibold text-slate-100 truncate">
            {dragPreview.host.alias}
          </span>
          {dragPreview.overGroup &&
            dragPreview.overGroup.toLowerCase() !== dragPreview.sourceGroup.toLowerCase() && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-medium shrink-0 max-w-[90px]">
                <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{dragPreview.overGroup}</span>
              </span>
            )}
        </div>
      )}

      {groupDragPreview && (
        <div
          style={{
            left: Math.min(groupDragPreview.clientX + 12, window.innerWidth - 220),
            top: Math.max(8, Math.min(groupDragPreview.clientY + 12, window.innerHeight - 40)),
          }}
          className={`${DRAG_PREVIEW_PILL_CLASS} max-w-[210px]`}
        >
          <Folder className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-semibold text-slate-100 truncate">
            {groupDragPreview.groupName}
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono shrink-0">
            {groupDragPreview.count}
          </span>
        </div>
      )}
    </>
  );
};
