import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Menu,
  Minus,
  Plus,
  RotateCw,
  Server,
  Shield,
  Square,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { SessionState, TerminalTabItem, HostProfileSummaryDto } from "../types/ipc";
import { tauriApi } from "../services/tauriApi";
import { useI18n } from "../i18n";

interface TabBarProps {
  tabs: TerminalTabItem[];
  activeTabId: string | null;
  isAppElevated: boolean;
  isModalOpen?: boolean;
  profiles: HostProfileSummaryDto[];
  onToggleSidebar: () => void;
  onSelectTab: (tabId: string) => void;
  onBlankSpaceClick?: () => void;
  onCloseTab: (tabId: string, e: React.MouseEvent) => void;
  onReconnectTab: (tabId: string, e: React.MouseEvent) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onNewTab: (asAdmin?: boolean) => void;
  onConnectProfile: (host: HostProfileSummaryDto) => void;
  onCreateNewHost: () => void;
  onContextMenuTab: (e: React.MouseEvent, tab: TerminalTabItem) => void;
  onContextMenuTabBar?: (e: React.MouseEvent) => void;
}

interface ActiveTabDrag {
  tabId: string;
  pointerId: number;
  captureEl: HTMLDivElement;
  startX: number;
  lastClientX: number;
  grabOffset: number;
  desiredLeft: number;
  appliedTranslate: number;
  isDragging: boolean;
  pendingSwap: boolean;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  isAppElevated,
  isModalOpen = false,
  profiles,
  onToggleSidebar,
  onSelectTab,
  onBlankSpaceClick,
  onCloseTab,
  onReconnectTab,
  onReorderTab,
  onNewTab,
  onConnectProfile,
  onCreateNewHost,
  onContextMenuTab,
  onContextMenuTabBar,
}) => {
  const { t } = useI18n();
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState(120);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [middleWidth, setMiddleWidth] = useState<number>(900);

  const newMenuRef = useRef<HTMLDivElement | null>(null);
  const middleRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<ActiveTabDrag | null>(null);
  const suppressClickRef = useRef(false);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const onSelectTabRef = useRef(onSelectTab);
  onSelectTabRef.current = onSelectTab;
  const onReorderTabRef = useRef(onReorderTab);
  onReorderTabRef.current = onReorderTab;

  const isCompactTabs =
    tabs.length > 0 && (middleWidth - 104) / tabs.length < 132;

  const toggleNewMenu = () => {
    setIsNewMenuOpen((prev) => {
      const next = !prev;
      if (next && newMenuRef.current) {
        const rect = newMenuRef.current.getBoundingClientRect();
        setMenuLeft(Math.max(8, Math.min(rect.left, window.innerWidth - 260)));
      }
      return next;
    });
  };

  useEffect(() => {
    if (isModalOpen) {
      setIsNewMenuOpen(false);
    }
  }, [isModalOpen]);

  useEffect(() => {
    const el = middleRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const updateWidth = () => setMiddleWidth(el.clientWidth);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!activeTabId || draggingTabId) return;
    const el = tabElsRef.current.get(activeTabId);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTabId, draggingTabId, tabs.length]);

  useEffect(() => {
    if (!isNewMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsNewMenuOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isNewMenuOpen]);

  // Keep dragged tab glued under the cursor immediately after React commits a slot swap.
  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (!drag || !drag.isDragging) return;
    drag.pendingSwap = false;
    const el = tabElsRef.current.get(drag.tabId);
    if (!el) return;
    el.style.transform = "";
    const layoutLeft = el.getBoundingClientRect().left;
    const dx = drag.desiredLeft - layoutLeft;
    drag.appliedTranslate = dx;
    el.style.transform = `translate3d(${dx}px, 0, 0)`;
  }, [tabs, draggingTabId]);

  useEffect(() => {
    let rafId: number | null = null;

    const syncDraggedPosition = (clientX: number) => {
      const drag = dragRef.current;
      const strip = stripRef.current;
      if (!drag || !strip) return;
      const el = tabElsRef.current.get(drag.tabId);
      if (!el) return;

      const stripRect = strip.getBoundingClientRect();
      const tabRect = el.getBoundingClientRect();
      const layoutLeft = tabRect.left - drag.appliedTranslate;
      const maxLeft = Math.max(stripRect.left, stripRect.right - tabRect.width);
      const desiredLeft = Math.max(
        stripRect.left,
        Math.min(maxLeft, clientX - drag.grabOffset)
      );
      drag.desiredLeft = desiredLeft;

      const dx = desiredLeft - layoutLeft;
      drag.appliedTranslate = dx;
      el.style.transform = `translate3d(${dx}px, 0, 0)`;

      // Determine slot crossing by midpoint with slight hysteresis to prevent ping-ponging.
      if (!drag.pendingSwap) {
        const list = tabsRef.current;
        const fromIndex = list.findIndex((item) => item.tabId === drag.tabId);
        if (fromIndex !== -1) {
          const dragCenter = desiredLeft + tabRect.width / 2;
          let targetIndex = fromIndex;

          for (let i = fromIndex - 1; i >= 0; i--) {
            const neighborEl = tabElsRef.current.get(list[i].tabId);
            if (!neighborEl) continue;
            const nRect = neighborEl.getBoundingClientRect();
            // Use > 0.5 threshold so clamping at stripRect.left still swaps cleanly into slot 0.
            if (dragCenter < nRect.left + nRect.width * 0.62) {
              targetIndex = i;
            } else {
              break;
            }
          }

          if (targetIndex === fromIndex) {
            for (let i = fromIndex + 1; i < list.length; i++) {
              const neighborEl = tabElsRef.current.get(list[i].tabId);
              if (!neighborEl) continue;
              const nRect = neighborEl.getBoundingClientRect();
              if (dragCenter > nRect.left + nRect.width * 0.38) {
                targetIndex = i;
              } else {
                break;
              }
            }
          }

          if (targetIndex !== fromIndex) {
            drag.pendingSwap = true;
            onReorderTabRef.current(drag.tabId, targetIndex);
          }
        }
      }
    };

    const autoScrollEdge = () => {
      rafId = null;
      const drag = dragRef.current;
      const strip = stripRef.current;
      if (!drag || !drag.isDragging || !strip) return;
      if (strip.scrollWidth > strip.clientWidth) {
        const sRect = strip.getBoundingClientRect();
        const edge = 26;
        let delta = 0;
        if (drag.lastClientX < sRect.left + edge) {
          delta = -Math.max(4, Math.round((sRect.left + edge - drag.lastClientX) * 0.45));
        } else if (drag.lastClientX > sRect.right - edge) {
          delta = Math.max(4, Math.round((drag.lastClientX - (sRect.right - edge)) * 0.45));
        }
        if (delta !== 0) {
          strip.scrollLeft += delta;
          syncDraggedPosition(drag.lastClientX);
          rafId = window.requestAnimationFrame(autoScrollEdge);
        }
      }
    };

    const stopDrag = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = "";
      const drag = dragRef.current;
      if (!drag) return;
      try {
        if (drag.captureEl.hasPointerCapture(drag.pointerId)) {
          drag.captureEl.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Ignore if element unmounted or capture already released
      }
      const el = tabElsRef.current.get(drag.tabId);
      if (el) {
        el.style.transform = "";
      }
      if (drag.isDragging) {
        suppressClickRef.current = true;
        onSelectTabRef.current(drag.tabId);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 50);
      }
      dragRef.current = null;
      setDraggingTabId(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const el = tabElsRef.current.get(drag.tabId);
      const strip = stripRef.current;
      if (!el || !strip) {
        stopDrag();
        return;
      }

      if (!drag.isDragging) {
        if (Math.abs(e.clientX - drag.startX) < 4) return;
        drag.isDragging = true;
        document.body.style.cursor = "grabbing";
        setDraggingTabId(drag.tabId);
        onSelectTabRef.current(drag.tabId);
      }

      drag.lastClientX = e.clientX;
      syncDraggedPosition(e.clientX);

      if (rafId === null && strip.scrollWidth > strip.clientWidth) {
        const sRect = strip.getBoundingClientRect();
        if (e.clientX < sRect.left + 26 || e.clientX > sRect.right - 26) {
          rafId = window.requestAnimationFrame(autoScrollEdge);
        }
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        stopDrag();
      }
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    window.addEventListener("blur", stopDrag);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("blur", stopDrag);
    };
  }, []);

  const handleTabPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    tabId: string
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();

    const captureEl = e.currentTarget;
    try {
      captureEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic event lacks pointer capture support
    }

    const rect = captureEl.getBoundingClientRect();
    dragRef.current = {
      tabId,
      pointerId: e.pointerId,
      captureEl,
      startX: e.clientX,
      lastClientX: e.clientX,
      grabOffset: e.clientX - rect.left,
      desiredLeft: rect.left,
      appliedTranslate: 0,
      isDragging: false,
      pendingSwap: false,
    };
  };

  const handleStripWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      strip.scrollLeft += e.deltaY;
    }
  };

  const getStatusIndicator = (state: SessionState) => {
    switch (state) {
      case "CONNECTING":
      case "HANDSHAKING":
        return {
          dotClass:
            "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]",
          label: t("status.connecting"),
        };
      case "ONLINE":
        return {
          dotClass: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]",
          label: t("status.online"),
        };
      case "AUTH_FAILED":
        return {
          dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
          label: t("status.auth_failed"),
        };
      case "PORT_CONFLICT":
        return {
          dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
          label: t("status.port_conflict"),
        };
      case "DISCONNECTED":
      case "ERROR":
      default:
        return {
          dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
          label:
            state === "DISCONNECTED"
              ? t("status.disconnected")
              : t("status.error"),
        };
    }
  };

  return (
    <div
      data-tauri-drag-region={isModalOpen ? "deep" : undefined}
      onContextMenu={(e) => {
        if (isModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!onContextMenuTabBar) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenuTabBar(e);
      }}
      className="h-9 bg-slate-950 border-b border-slate-800/80 flex items-center select-none shrink-0 relative z-[80]"
    >
      <button
        type="button"
        disabled={isModalOpen}
        onClick={onToggleSidebar}
        title={t("app.menu")}
        className={`ml-1.5 mr-1 p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0 ${
          isModalOpen ? "opacity-45 pointer-events-none" : ""
        }`}
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Shrinking + scrollable browser-style tab area, pinned + button, and drag region */}
      <div
        ref={middleRef}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isModalOpen) {
            onBlankSpaceClick?.();
          }
        }}
        className="flex items-center flex-1 min-w-0 h-full gap-1"
      >
        <div
          ref={stripRef}
          onWheel={handleStripWheel}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isModalOpen) {
              onBlankSpaceClick?.();
            }
          }}
          className={`flex items-end flex-initial min-w-0 max-w-full gap-1 h-full overflow-x-auto no-scrollbar transition-opacity ${
            isModalOpen ? "opacity-45 pointer-events-none" : ""
          }`}
        >
          {tabs.map((tab) => {
            const isActive = tab.tabId === activeTabId;
            const isDragged = tab.tabId === draggingTabId;
            const isLocal = tab.hostId === "local";
            const status = getStatusIndicator(tab.state);
            const isOffline =
              tab.state === "DISCONNECTED" ||
              tab.state === "ERROR" ||
              tab.state === "AUTH_FAILED";

            return (
              <div
                key={tab.tabId}
                draggable={false}
                ref={(el) => {
                  if (el) {
                    tabElsRef.current.set(tab.tabId, el);
                  } else {
                    tabElsRef.current.delete(tab.tabId);
                  }
                }}
                onPointerDown={(e) => handleTabPointerDown(e, tab.tabId)}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.tabId, e);
                  }
                }}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onSelectTab(tab.tabId);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenuTab(e, tab);
                }}
                title={
                  isLocal
                    ? tab.isAdmin
                      ? `${tab.title} (${t("app.admin_badge")})`
                      : tab.title
                    : `${tab.title} (${tab.hostSubtitle}) — ${status.label}`
                }
                className={`group relative flex items-center gap-1.5 px-2.5 h-8 rounded-t-md text-xs font-medium cursor-pointer touch-none select-none w-[190px] min-w-[100px] max-w-[210px] shrink grow-0 border-t border-x ${
                  isDragged
                    ? "z-30 bg-[#0d1424] text-white border-sky-500/60 shadow-[0_8px_22px_rgba(0,0,0,0.75)]"
                    : "transition-[background-color,color,border-color] duration-150"
                } ${
                  !isDragged &&
                  (isActive
                    ? "bg-[#090d16] text-slate-100 border-slate-700/80 shadow-sm z-10"
                    : "bg-slate-900/50 text-slate-400 border-transparent hover:bg-slate-800/70 hover:text-slate-200")
                }`}
              >
                {(isActive || isDragged) && (
                  <div
                    className={`absolute top-0 left-0 right-0 h-[2px] rounded-t-md ${
                      tab.isAdmin ? "bg-amber-400" : "bg-sky-400"
                    }`}
                  />
                )}

                {isLocal ? (
                  tab.isAdmin ? (
                    <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <TerminalIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  )
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${status.dotClass}`}
                    title={status.label}
                  />
                )}

                <span className="truncate font-medium flex-1 min-w-0">
                  {tab.title}
                </span>

                {tab.isAdmin && !isCompactTabs && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-semibold text-amber-300 shrink-0">
                    {t("app.admin_badge")}
                  </span>
                )}

                {!isLocal && (
                  <button
                    type="button"
                    onClick={(e) => onReconnectTab(tab.tabId, e)}
                    title={t("common.reconnect")}
                    className={`inline-flex p-0.5 rounded hover:bg-slate-700/70 transition-colors shrink-0 ${
                      isOffline
                        ? "text-sky-400 hover:text-sky-300"
                        : "text-slate-400 hover:text-sky-300"
                    }`}
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => onCloseTab(tab.tabId, e)}
                  title={t("common.close")}
                  className="p-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Split New-Tab + Profile Dropdown (Windows Terminal style) */}
        <div
          ref={newMenuRef}
          className={`relative flex items-center shrink-0 transition-opacity ${
            isModalOpen ? "opacity-45 pointer-events-none" : ""
          }`}
        >
          <div className="flex items-center rounded-md overflow-hidden border border-transparent hover:border-slate-800 bg-transparent hover:bg-slate-900/70">
            <button
              type="button"
              onClick={() => onNewTab(isAppElevated)}
              title={
                isAppElevated ? t("app.local_admin") : t("status.new_tab")
              }
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleNewMenu}
              title={t("app.new_tab_menu")}
              className="px-1 py-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors border-l border-slate-800/70"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {isNewMenuOpen && (
            <div
              style={{ left: menuLeft }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="fixed top-9 mt-0.5 min-w-[230px] max-w-[280px] py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_14px_40px_rgba(0,0,0,0.72)] text-xs z-50"
            >
              <button
                type="button"
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onNewTab(isAppElevated);
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-sky-500/15 hover:text-white transition-colors"
              >
                {isAppElevated ? (
                  <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <TerminalIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
                <span className="truncate font-medium">
                  {isAppElevated ? t("app.local_admin") : t("app.local_shell")}
                </span>
              </button>

              {!isAppElevated && (
                <button
                  type="button"
                  onClick={() => {
                    setIsNewMenuOpen(false);
                    onNewTab(true);
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 transition-colors"
                >
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate font-medium">
                    {t("app.local_admin")}
                  </span>
                </button>
              )}

              {profiles.length > 0 && (
                <>
                  <div className="my-1 border-t border-slate-800" />
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {t("ctx.saved_hosts")}
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {profiles.slice(0, 12).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setIsNewMenuOpen(false);
                          onConnectProfile(p);
                        }}
                        className="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left text-slate-300 hover:bg-sky-500/15 hover:text-white transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Server className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate font-medium">
                            {p.alias}
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 truncate max-w-[95px]">
                          {p.host}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="my-1 border-t border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  setIsNewMenuOpen(false);
                  onCreateNewHost();
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-sky-300 hover:bg-sky-500/15 hover:text-sky-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate font-medium">
                  {t("ctx.new_connection")}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Draggable window title region */}
        <div
          data-tauri-drag-region
          onClick={() => {
            if (!isModalOpen) {
              onBlankSpaceClick?.();
            }
          }}
          className="flex-1 h-full min-w-[44px]"
        />
      </div>

      {/* App-level Admin badge when started as Administrator */}
      {isAppElevated && (
        <div
          data-tauri-drag-region="deep"
          className="mr-2 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 flex items-center gap-1 text-[10px] font-semibold text-amber-300 shrink-0"
        >
          <Shield className="w-3 h-3" />
          <span>{t("app.admin_badge")}</span>
        </div>
      )}

      {/* Windows Terminal style window caption controls */}
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex items-center h-full shrink-0"
      >
        <button
          type="button"
          onClick={() => tauriApi.windowMinimize().catch(() => {})}
          title={t("window.minimize")}
          className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => tauriApi.windowToggleMaximize().catch(() => {})}
          title={t("window.maximize")}
          className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => tauriApi.windowClose().catch(() => {})}
          title={t("window.close")}
          className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-rose-600 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
