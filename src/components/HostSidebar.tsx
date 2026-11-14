import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  Folder,
  KeyRound,
  Lock,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  Tag,
  Trash2,
} from "lucide-react";
import { HostProfileSummaryDto } from "../types/ipc";
import { useI18n } from "../i18n";
import { getEditableInput } from "../utils/editableTarget";

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
  onCreateNew: () => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
  onEditHost: (hostId: string) => void;
  onDuplicateHost: (host: HostProfileSummaryDto) => void;
  onDeleteHost: (host: HostProfileSummaryDto) => void;
  onMoveHostToGroup: (hostId: string, targetGroup: string) => void | Promise<void>;
  onContextMenuHost?: (e: React.MouseEvent, host: HostProfileSummaryDto) => void;
  onContextMenuGroup?: (e: React.MouseEvent, groupName: string) => void;
  onContextMenuSidebar?: (e: React.MouseEvent) => void;
}

interface ActiveHostDrag {
  host: HostProfileSummaryDto;
  sourceGroup: string;
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  isDragging: boolean;
  overGroup: string | null;
}

interface HostDragPreview {
  host: HostProfileSummaryDto;
  sourceGroup: string;
  clientX: number;
  clientY: number;
  overGroup: string | null;
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
  onCreateNew,
  onOpenVault,
  onOpenSettings,
  onEditHost,
  onDuplicateHost,
  onDeleteHost,
  onMoveHostToGroup,
  onContextMenuHost,
  onContextMenuGroup,
  onContextMenuSidebar,
}) => {
  const { t } = useI18n();
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [dragPreview, setDragPreview] = useState<HostDragPreview | null>(null);

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const groupElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevGroupCountsRef = useRef<Map<string, number>>(new Map());
  const dragRef = useRef<ActiveHostDrag | null>(null);
  const suppressDblClickRef = useRef(false);
  const onMoveHostRef = useRef(onMoveHostToGroup);
  onMoveHostRef.current = onMoveHostToGroup;

  const groupedProfiles = useMemo(() => {
    const map = new Map<string, HostProfileSummaryDto[]>();
    const canonByLower = new Map<string, string>();

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
      for (const g of groups) {
        ensureGroup(g);
      }
    }

    for (const p of profiles) {
      const targetKey = ensureGroup(p.group_name || "Default");
      map.get(targetKey)!.push(p);
    }

    return Array.from(map.entries()).sort(([a], [b]) => {
      const aDef = a.toLowerCase() === "default";
      const bDef = b.toLowerCase() === "default";
      if (aDef !== bDef) return aDef ? -1 : 1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [profiles, groups, isFiltering]);

  useEffect(() => {
    const prevCounts = prevGroupCountsRef.current;
    const nextCounts = new Map<string, number>();
    const clearedEmptyKeys: string[] = [];

    for (const [groupName, items] of groupedProfiles) {
      const key = groupName.trim().toLowerCase();
      nextCounts.set(key, items.length);
      const prevCount = prevCounts.get(key) ?? 0;
      if (prevCount > 0 && items.length === 0) {
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

  useEffect(() => {
    if (!isOpen) {
      dragRef.current = null;
      setDragPreview(null);
      document.body.style.cursor = "";
    }
  }, [isOpen]);

  useEffect(() => {
    let rafId: number | null = null;

    const findGroupAtPoint = (clientX: number, clientY: number): string | null => {
      for (const [groupName, el] of groupElsRef.current.entries()) {
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return groupName;
        }
      }
      return null;
    };

    const autoScrollEdge = () => {
      const drag = dragRef.current;
      const scroller = listScrollRef.current;
      if (!drag || !drag.isDragging || !scroller) {
        rafId = null;
        return;
      }

      const rect = scroller.getBoundingClientRect();
      const edge = 36;
      let delta = 0;
      if (drag.clientY < rect.top + edge) {
        delta = -Math.max(3, Math.round((rect.top + edge - drag.clientY) / 4));
      } else if (drag.clientY > rect.bottom - edge) {
        delta = Math.max(3, Math.round((drag.clientY - (rect.bottom - edge)) / 4));
      }

      if (delta !== 0) {
        scroller.scrollTop += delta;
        const hovered = findGroupAtPoint(drag.clientX, drag.clientY);
        if (hovered !== drag.overGroup) {
          drag.overGroup = hovered;
          setDragPreview({
            host: drag.host,
            sourceGroup: drag.sourceGroup,
            clientX: drag.clientX,
            clientY: drag.clientY,
            overGroup: hovered,
          });
        }
        rafId = window.requestAnimationFrame(autoScrollEdge);
      } else {
        rafId = null;
      }
    };

    const finishDrag = (commitDrop: boolean) => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = "";
      const drag = dragRef.current;
      dragRef.current = null;
      setDragPreview(null);

      if (!drag || !drag.isDragging) return;

      suppressDblClickRef.current = true;
      window.setTimeout(() => {
        suppressDblClickRef.current = false;
      }, 120);

      if (
        commitDrop &&
        drag.overGroup &&
        drag.overGroup.toLowerCase() !== drag.sourceGroup.toLowerCase()
      ) {
        const targetGroup = drag.overGroup;
        const targetKey = targetGroup.trim().toLowerCase();
        setCollapsedGroups((prev) =>
          prev[targetKey] === false ? prev : { ...prev, [targetKey]: false }
        );
        void onMoveHostRef.current(drag.host.id, targetGroup);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      if (!drag.isDragging) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) {
          return;
        }
        drag.isDragging = true;
        document.body.style.cursor = "grabbing";
      }

      drag.clientX = e.clientX;
      drag.clientY = e.clientY;
      drag.overGroup = findGroupAtPoint(e.clientX, e.clientY);
      setDragPreview({
        host: drag.host,
        sourceGroup: drag.sourceGroup,
        clientX: e.clientX,
        clientY: e.clientY,
        overGroup: drag.overGroup,
      });

      const scroller = listScrollRef.current;
      if (rafId === null && scroller && scroller.scrollHeight > scroller.clientHeight) {
        const rect = scroller.getBoundingClientRect();
        if (e.clientY < rect.top + 36 || e.clientY > rect.bottom - 36) {
          rafId = window.requestAnimationFrame(autoScrollEdge);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        finishDrag(true);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        finishDrag(false);
      }
    };

    const onWindowBlur = () => {
      finishDrag(false);
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  const handleHostPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    host: HostProfileSummaryDto,
    sourceGroup: string
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      host,
      sourceGroup,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      isDragging: false,
      overGroup: null,
    };
  };

  const toggleGroup = (group: string, currentCollapsed: boolean) => {
    const key = group.trim().toLowerCase();
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !currentCollapsed,
    }));
  };

  const handleSelectHost = (host: HostProfileSummaryDto) => {
    onConnectHost(host);
    onClose();
  };

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
        {/* Sidebar header with +, Key Vault, and Settings icons */}
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

        {/* Search and tag filters */}
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
                  onClick={() =>
                    onSelectTag(selectedTag === tag ? null : tag)
                  }
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

        {/* Grouped Host list */}
        <div ref={listScrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
          {groupedProfiles.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Server className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-medium">
                {t("host.empty")}
              </p>
            </div>
          ) : (
            groupedProfiles.map(([groupName, items]) => {
              const groupKey = groupName.trim().toLowerCase();
              const isCollapsed = collapsedGroups[groupKey] ?? items.length === 0;
              const isDropTarget =
                !!dragPreview &&
                dragPreview.overGroup?.toLowerCase() === groupName.toLowerCase() &&
                dragPreview.sourceGroup.toLowerCase() !== groupName.toLowerCase();
              return (
                <div
                  key={groupName}
                  ref={(el) => {
                    if (el) {
                      groupElsRef.current.set(groupName, el);
                    } else {
                      groupElsRef.current.delete(groupName);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (!onContextMenuGroup) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenuGroup(e, groupName);
                  }}
                  className={`space-y-1 rounded-lg transition-colors ${
                    isDropTarget
                      ? "bg-sky-500/10 ring-1 ring-sky-400/75 p-1 -m-1"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupName, isCollapsed)}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                      isDropTarget
                        ? "text-sky-200 bg-sky-500/15"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                      <Folder className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                      <span className="truncate">{groupName}</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">
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
                        items.map((host) => {
                          const isDraggingThis = dragPreview?.host.id === host.id;
                          return (
                            <div
                              key={host.id}
                              onPointerDown={(e) =>
                                handleHostPointerDown(e, host, groupName)
                              }
                              onDoubleClick={() => {
                                if (suppressDblClickRef.current) return;
                                handleSelectHost(host);
                              }}
                              onContextMenu={(e) => {
                                if (!onContextMenuHost) return;
                                e.preventDefault();
                                e.stopPropagation();
                                onContextMenuHost(e, host);
                              }}
                              className={`group p-2 rounded-md border transition-all cursor-grab active:cursor-grabbing ${
                                isDraggingThis
                                  ? "opacity-45 bg-slate-900/60 border-dashed border-sky-500/60"
                                  : "bg-slate-950/60 hover:bg-slate-800/80 border-slate-800/70 hover:border-slate-700"
                              }`}
                            >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className={`inline-flex items-center justify-center w-4 h-4 rounded shrink-0 ${
                                  host.auth_method === "SSH_KEY"
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-amber-500/15 text-amber-400"
                                }`}
                              >
                                {host.auth_method === "SSH_KEY" ? (
                                  <KeyRound className="w-2.5 h-2.5" />
                                ) : (
                                  <Lock className="w-2.5 h-2.5" />
                                )}
                              </span>
                              <span className="text-xs font-semibold text-slate-200 truncate">
                                {host.alias}
                              </span>
                            </div>

                            <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectHost(host);
                                }}
                                title={t("common.connect")}
                                className="p-1 rounded text-emerald-400 hover:bg-emerald-500/15"
                              >
                                <Play className="w-3 h-3 fill-current" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDuplicateHost(host);
                                }}
                                title={t("common.duplicate")}
                                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditHost(host.id);
                                }}
                                title={t("common.edit")}
                                className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-700/60"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteHost(host);
                                }}
                                title={t("common.delete")}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/15"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                            <span className="truncate">
                              {host.username}@{host.host}:{host.port}
                            </span>
                            {host.active_port_forwards_count > 0 && (
                              <span className="text-[9px] px-1 rounded bg-sky-500/15 text-sky-300 shrink-0">
                                PF:{host.active_port_forwards_count}
                              </span>
                            )}
                          </div>

                          {host.tags.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                              {host.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.2 rounded bg-slate-900 text-sky-300 border border-slate-800 text-[9px]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

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
          className="fixed z-[120] pointer-events-none flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-sky-500/60 shadow-[0_12px_30px_rgba(0,0,0,0.75)] text-xs select-none max-w-[220px]"
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
            dragPreview.overGroup.toLowerCase() !==
              dragPreview.sourceGroup.toLowerCase() && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-medium shrink-0 max-w-[90px]">
                <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{dragPreview.overGroup}</span>
              </span>
            )}
        </div>
      )}
    </>
  );
};
