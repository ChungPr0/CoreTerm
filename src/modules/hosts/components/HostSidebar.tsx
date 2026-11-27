import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Plus, Search, Server, Settings, Tag } from "lucide-react";
import type { HostProfileSummaryDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { IconButton, Input } from "@/shared/ui";
import { getShortcutChord } from "@/shared/utils/shortcuts";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import { getEditableInput } from "@/shared/utils/editableTarget";
import { setElementInert, trapTabWithin } from "@/shared/utils/focusTrap";
import { useHostDrag } from "../hooks/useHostDrag";
import { useGroupDrag } from "../hooks/useGroupDrag";
import { groupAndSortProfiles } from "../utils/hostGrouping";
import { HostDragOverlays } from "./HostDragOverlays";
import { HostGroupList } from "./HostGroupList";

interface HostSidebarProps {
  isOpen: boolean;
  isModalOpen?: boolean;
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
  isModalOpen = false,
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
  const keybindings = useSettingsStore((s) => s.settings.keybindings);
  const settingsShortcut = getShortcutChord("openSettings", keybindings);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const asideRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const groupElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevGroupCountsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    setElementInert(asideRef.current, !isOpen || isModalOpen);
  }, [isOpen, isModalOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => {
      if (document.querySelector('[data-modal-panel="true"]')) return;
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (document.querySelector('[data-modal-panel="true"]')) return;
      trapTabWithin(asideRef.current, e);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, isModalOpen]);

  const groupedProfiles = useMemo(
    () => groupAndSortProfiles(profiles, groups, isFiltering),
    [profiles, groups, isFiltering]
  );

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
        ref={asideRef}
        aria-hidden={!isOpen}
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
            <IconButton
              tabIndex={0}
              onClick={onCreateNew}
              title={t("host.create")}
              tone="sky"
              size="sm"
              bordered
              icon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
            />
            <IconButton
              tabIndex={0}
              onClick={onOpenVault}
              title={t("vault.title")}
              tone="emerald"
              size="sm"
              bordered
              icon={<KeyRound className="w-3.5 h-3.5" />}
            />
            <IconButton
              tabIndex={0}
              onClick={onOpenSettings}
              title={`${t("settings.title")} (${settingsShortcut})`}
              tone="default"
              size="sm"
              bordered
              icon={<Settings className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        <div className="p-2.5 border-b border-slate-800/80 space-y-2">
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("host.search")}
            leftIcon={<Search className="w-3.5 h-3.5 text-slate-500" />}
            inputSize="sm"
          />

          {allTags.length > 0 && (
            <div
              role="toolbar"
              aria-label={t("host.tags")}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const btns = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tag-pill]")
                );
                const curIdx = btns.indexOf(e.target as HTMLButtonElement);
                if (curIdx < 0 || btns.length === 0) return;
                e.preventDefault();
                const nextIdx =
                  e.key === "ArrowRight"
                    ? (curIdx + 1) % btns.length
                    : (curIdx - 1 + btns.length) % btns.length;
                btns[nextIdx]?.focus();
                btns[nextIdx]?.click();
              }}
              className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5"
            >
              <Tag className="w-3 h-3 text-slate-500 shrink-0 mr-0.5" />
              <button
                type="button"
                data-tag-pill="all"
                tabIndex={selectedTag === null || !allTags.includes(selectedTag) ? 0 : -1}
                onClick={() => onSelectTag(null)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
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
                  data-tag-pill={tag}
                  tabIndex={selectedTag === tag ? 0 : -1}
                  onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
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

      <HostDragOverlays dragPreview={dragPreview} groupDragPreview={groupDragPreview} />
    </>
  );
};
