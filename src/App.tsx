import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  ClipboardCopy,
  CopyPlus,
  Edit2,
  Eraser,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  Play,
  Plus,
  RotateCw,
  Scissors,
  Search,
  Settings as SettingsIcon,
  Shield,
  Terminal as TerminalIcon,
  TextSelect,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  ConflictStrategy,
  PortProbeResultDto,
  SessionAuthPromptEventDto,
  SessionConnectAckDto,
  SessionHostKeyPromptEventDto,
  TelemetryMetricsEventDto,
  TerminalTabItem,
  HostFullConfigDto,
  HostProfileSummaryDto,
} from "./types/ipc";
import { tauriApi } from "./services/tauriApi";
import { HostSidebar } from "./components/HostSidebar";
import { TabBar } from "./components/TabBar";
import {
  TerminalContextActions,
  TerminalViewport,
} from "./components/TerminalViewport";
import type { AppSettingsValues } from "./components/SettingsModal";
import type { ContextMenuEntry } from "./components/ContextMenu";

const loadHostModal = () => import("./components/HostModal");
const loadKeyVaultModal = () => import("./components/KeyVaultModal");
const loadSettingsModal = () => import("./components/SettingsModal");
const loadAuthPromptModal = () => import("./components/AuthPromptModal");
const loadPortConflictModal = () => import("./components/PortConflictModal");
const loadCommandPalette = () => import("./components/CommandPalette");
const loadContextMenu = () => import("./components/ContextMenu");
const loadConfirmDeleteModal = () => import("./components/ConfirmDeleteModal");
const loadGroupModal = () => import("./components/GroupModal");

const deferredModalLoaders = [
  loadHostModal,
  loadKeyVaultModal,
  loadSettingsModal,
  loadAuthPromptModal,
  loadPortConflictModal,
  loadCommandPalette,
  loadContextMenu,
  loadConfirmDeleteModal,
  loadGroupModal,
];

const HostModal = lazy(() =>
  loadHostModal().then((m) => ({ default: m.HostModal }))
);
const KeyVaultModal = lazy(() =>
  loadKeyVaultModal().then((m) => ({ default: m.KeyVaultModal }))
);
const SettingsModal = lazy(() =>
  loadSettingsModal().then((m) => ({ default: m.SettingsModal }))
);
const AuthPromptModal = lazy(() =>
  loadAuthPromptModal().then((m) => ({ default: m.AuthPromptModal }))
);
const PortConflictModal = lazy(() =>
  loadPortConflictModal().then((m) => ({ default: m.PortConflictModal }))
);
const CommandPalette = lazy(() =>
  loadCommandPalette().then((m) => ({ default: m.CommandPalette }))
);
const ContextMenu = lazy(() =>
  loadContextMenu().then((m) => ({ default: m.ContextMenu }))
);
const ConfirmDeleteModal = lazy(() =>
  loadConfirmDeleteModal().then((m) => ({ default: m.ConfirmDeleteModal }))
);
const GroupModal = lazy(() =>
  loadGroupModal().then((m) => ({ default: m.GroupModal }))
);
import { useI18n } from "./i18n";
import { getEditableInput } from "./utils/editableTarget";
import { formatLocalizedError } from "./utils/formatError";

const SETTINGS_STORAGE_KEY = "coreterm_settings";

function loadSettings(): AppSettingsValues {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        launchCols: Number(parsed.launchCols) || 120,
        launchRows: Number(parsed.launchRows) || 30,
        showLocalTelemetry:
          typeof parsed.showLocalTelemetry === "boolean"
            ? parsed.showLocalTelemetry
            : false,
        telemetryIntervalSec: Math.min(
          Math.max(Number(parsed.telemetryIntervalSec) || 2, 1),
          60
        ),
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    launchCols: 120,
    launchRows: 30,
    showLocalTelemetry: false,
    telemetryIntervalSec: 2,
  };
}

function createLocalTab(isAdmin = false): TerminalTabItem {
  return {
    tabId: crypto.randomUUID(),
    hostId: "local",
    title: "PowerShell",
    hostSubtitle: "Local",
    state: "CONNECTING",
    errorMessage: null,
    reconnectToken: 0,
    autoReconnect: false,
    reconnectIntervalSec: 2,
    isAdmin,
  };
}

async function copyText(text: string): Promise<void> {
  if (!text) return;
  try {
    await tauriApi.clipboardWriteText(text);
  } catch {
    await navigator.clipboard.writeText(text).catch(() => {});
  }
}

async function readText(): Promise<string> {
  try {
    return await tauriApi.clipboardReadText();
  } catch {
    return await navigator.clipboard.readText().catch(() => "");
  }
}

function replaceInputSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const nextVal = el.value.slice(0, start) + text + el.value.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, nextVal);
  } else {
    el.value = nextVal;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  el.focus();
}

export const App: React.FC = () => {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettingsValues>(loadSettings);
  const [isAppElevated, setIsAppElevated] = useState<boolean>(false);
  const [hasNativeBorder, setHasNativeBorder] = useState<boolean>(false);
  const [allProfiles, setAllProfiles] = useState<HostProfileSummaryDto[]>([]);
  const [dbGroups, setDbGroups] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Open initial local terminal tab on startup like Windows Terminal
  const [tabs, setTabs] = useState<TerminalTabItem[]>(() => [createLocalTab()]);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => tabs[0]?.tabId ?? null
  );
  const [telemetryByHost, setTelemetryByHost] = useState<
    Record<string, TelemetryMetricsEventDto>
  >({});
  // Runtime-only map of tabs whose telemetry bar was temporarily hidden via right-click; cleared on app restart.
  const [hiddenTelemetryTabIds, setHiddenTelemetryTabIds] = useState<
    Record<string, boolean>
  >({});

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [focusToken, setFocusToken] = useState<number>(0);

  const focusActiveTerminal = useCallback(() => {
    setFocusToken((prev) => prev + 1);
  }, []);

  const handleDismissSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    focusActiveTerminal();
  }, [focusActiveTerminal]);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      setIsSidebarOpen(false);
      focusActiveTerminal();
    },
    [focusActiveTerminal]
  );

  const handleToggleSidebar = useCallback(() => {
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      focusActiveTerminal();
    } else {
      setIsSidebarOpen(true);
    }
  }, [isSidebarOpen, focusActiveTerminal]);
  const [isHostModalOpen, setIsHostModalOpen] = useState<boolean>(false);
  const [hostModalInitialGroup, setHostModalInitialGroup] =
    useState<string>("Default");
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);
  const [keysVersion, setKeysVersion] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState<boolean>(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState<boolean>(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [editingHost, setEditingHost] = useState<HostFullConfigDto | null>(null);
  const [deletingHost, setDeletingHost] = useState<HostProfileSummaryDto | null>(
    null
  );
  const [deleteHostError, setDeleteHostError] = useState<string | null>(null);
  const [isDeletingHost, setIsDeletingHost] = useState<boolean>(false);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [deleteGroupError, setDeleteGroupError] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState<boolean>(false);

  const requestDeleteHost = useCallback((host: HostProfileSummaryDto) => {
    setDeleteHostError(null);
    setDeletingHost(host);
  }, []);

  const closeDeleteHostModal = useCallback(() => {
    setDeletingHost(null);
    setDeleteHostError(null);
  }, []);

  const [authPrompt, setAuthPrompt] =
    useState<SessionAuthPromptEventDto | null>(null);
  const [hostKeyPrompt, setHostKeyPrompt] =
    useState<SessionHostKeyPromptEventDto | null>(null);
  const [pendingConflictHost, setPendingConflictHost] =
    useState<HostProfileSummaryDto | null>(null);
  const [portConflicts, setPortConflicts] = useState<PortProbeResultDto[]>([]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuEntry[];
  } | null>(null);

  // Present main window after initial mount (resizing beforehand if custom launch size),
  // configure local telemetry, check process elevation, and preload lazy modal chunks when idle
  useEffect(() => {
    const hasCustomLaunchSize =
      settings.launchCols !== 120 || settings.launchRows !== 30;
    let cancelled = false;

    const presentTimer = window.setTimeout(() => {
      if (cancelled) return;
      tauriApi
        .windowPresent(
          hasCustomLaunchSize
            ? { cols: settings.launchCols, rows: settings.launchRows }
            : undefined
        )
        .then(() => {
          if (!cancelled) {
            focusActiveTerminal();
          }
        })
        .catch(() => {});
    }, 0);

    const preloadTimer = window.setTimeout(() => {
      if (cancelled) return;
      deferredModalLoaders.forEach((load) => {
        void load().catch(() => {});
      });
    }, 150);

    tauriApi
      .telemetrySetLocalConfig(
        settings.showLocalTelemetry,
        settings.telemetryIntervalSec
      )
      .catch(() => {});

    tauriApi
      .appGetStatus()
      .then((status) => {
        setIsAppElevated(status.is_elevated);
        setHasNativeBorder(status.has_native_border);
        if (status.is_elevated) {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.hostId === "local" ? { ...tab, isAdmin: true } : tab
            )
          );
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.clearTimeout(presentTimer);
      window.clearTimeout(preloadTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSettings = (next: AppSettingsValues) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    tauriApi
      .windowSetLaunchSize(next.launchCols, next.launchRows)
      .catch(() => {});
    tauriApi
      .telemetrySetLocalConfig(next.showLocalTelemetry, next.telemetryIntervalSec)
      .catch(() => {});
    if (next.showLocalTelemetry) {
      const localTabIds = new Set(
        tabs.filter((t) => t.hostId === "local").map((t) => t.tabId)
      );
      if (localTabIds.size > 0) {
        setHiddenTelemetryTabIds((prev) => {
          const updated = { ...prev };
          let changed = false;
          for (const id of localTabIds) {
            if (updated[id]) {
              delete updated[id];
              changed = true;
            }
          }
          return changed ? updated : prev;
        });
      }
    }
  };

  const loadProfiles = useCallback(async (query?: string) => {
    try {
      const [list, groups] = await Promise.all([
        tauriApi.hostList({
          search_query: query?.trim() || undefined,
        }),
        tauriApi.hostGroupList().catch(() => [] as string[]),
      ]);
      setAllProfiles(list);
      setDbGroups(groups);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadProfiles(searchQuery);
  }, [loadProfiles, searchQuery]);

  const handleNewLocalTab = useCallback(
    (explicitAdmin?: boolean) => {
      const useAdmin =
        typeof explicitAdmin === "boolean" ? explicitAdmin : isAppElevated;
      const newTab = createLocalTab(useAdmin);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.tabId);
      setIsSidebarOpen(false);
      focusActiveTerminal();
    },
    [isAppElevated, focusActiveTerminal]
  );

  const hasBlockingModalRef = useRef<boolean>(false);
  const hasAnyModalRef = useRef<boolean>(false);

  // Global keyboard shortcuts (Ctrl+Shift+K palette, Ctrl+Shift+T new tab) in capture phase
  // so focused xterm instances and WebView2 accelerators cannot intercept them first.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "k" && key !== "t") return;

      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;

      if (key === "k" && !hasBlockingModalRef.current) {
        setContextMenu(null);
        setIsPaletteOpen((prev) => !prev);
      } else if (key === "t" && !hasAnyModalRef.current) {
        setContextMenu(null);
        handleNewLocalTab();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleNewLocalTab]);

  useEffect(() => {
    let unlistenStatus: (() => void) | null = null;
    let unlistenAuth: (() => void) | null = null;
    let unlistenHostKey: (() => void) | null = null;
    let unlistenTelemetry: (() => void) | null = null;

    tauriApi
      .onSessionStatus((payload) => {
        setTabs((prev) =>
          prev.map((tab) =>
            tab.tabId === payload.tab_id
              ? {
                  ...tab,
                  state: payload.state,
                  errorMessage: payload.error_message ?? null,
                  activeForwards: payload.active_local_forwards,
                }
              : tab
          )
        );
      })
      .then((fn) => {
        unlistenStatus = fn;
      });

    tauriApi
      .onAuthPrompt((payload) => {
        setAuthPrompt(payload);
      })
      .then((fn) => {
        unlistenAuth = fn;
      });

    tauriApi
      .onHostKeyPrompt((payload) => {
        setHostKeyPrompt(payload);
      })
      .then((fn) => {
        unlistenHostKey = fn;
      });

    tauriApi
      .onTelemetryMetrics((payload) => {
        setTelemetryByHost((prev) => ({
          ...prev,
          [payload.host_id]: payload,
        }));
      })
      .then((fn) => {
        unlistenTelemetry = fn;
      });

    return () => {
      if (unlistenStatus) unlistenStatus();
      if (unlistenAuth) unlistenAuth();
      if (unlistenHostKey) unlistenHostKey();
      if (unlistenTelemetry) unlistenTelemetry();
    };
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProfiles) {
      for (const tag of p.tags) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return Array.from(set).sort();
  }, [allProfiles]);

  const filteredProfiles = useMemo(() => {
    if (!selectedTag) return allProfiles;
    return allProfiles.filter((p) => p.tags.includes(selectedTag));
  }, [allProfiles, selectedTag]);

  const existingGroups = useMemo(() => {
    const byLower = new Map<string, string>();
    const addGroup = (raw: string) => {
      const clean = raw.trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!byLower.has(key)) {
        byLower.set(key, clean);
      }
    };

    addGroup("Default");
    for (const g of dbGroups) {
      addGroup(g);
    }
    for (const p of allProfiles) {
      if (p.group_name) addGroup(p.group_name);
    }
    return Array.from(byLower.values());
  }, [dbGroups, allProfiles]);

  const spawnHostTab = useCallback(
    (host: HostProfileSummaryDto, strategy: ConflictStrategy) => {
      const newTabId = crypto.randomUUID();
      setTabs((prev) => {
        const newTab: TerminalTabItem = {
          tabId: newTabId,
          hostId: host.id,
          title: host.alias,
          hostSubtitle: `${host.username}@${host.host}:${host.port}`,
          state: "CONNECTING",
          errorMessage: null,
          reconnectToken: 0,
          conflictStrategy: strategy,
          telemetryEnabled: host.telemetry_enabled,
          autoReconnect: host.auto_reconnect,
          reconnectIntervalSec: host.reconnect_interval_sec,
        };
        return [...prev, newTab];
      });
      setActiveTabId(newTabId);
      setIsSidebarOpen(false);
      focusActiveTerminal();
    },
    [focusActiveTerminal]
  );

  const handleConnectHost = useCallback(
    async (host: HostProfileSummaryDto) => {
      if (host.active_port_forwards_count > 0) {
        try {
          const probe = await tauriApi.portForwardProbe(host.id);
          const externalConflicts = probe.filter(
            (p) => p.status === "CONFLICT_EXTERNAL"
          );
          if (externalConflicts.length > 0) {
            setPendingConflictHost(host);
            setPortConflicts(externalConflicts);
            return;
          }
        } catch {
          // Proceed if probe fails
        }
      }
      spawnHostTab(host, "AUTO_SHARE_OR_SKIP");
    },
    [spawnHostTab]
  );

  const closeTabById = useCallback(
    (tabId: string) => {
      tauriApi.sessionDisconnect(tabId).catch(() => {});

      const idx = tabs.findIndex((item) => item.tabId === tabId);
      if (idx === -1) return;
      const nextTabs = tabs.filter((item) => item.tabId !== tabId);

      // Closing the last remaining tab closes the window.
      if (nextTabs.length === 0) {
        setTabs([]);
        setActiveTabId(null);
        tauriApi.windowClose().catch(() => {});
        return;
      }

      setTabs(nextTabs);
      if (activeTabId === tabId) {
        const nextIdx = Math.min(idx, nextTabs.length - 1);
        setActiveTabId(nextTabs[nextIdx].tabId);
      }
    },
    [activeTabId, tabs]
  );

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      closeTabById(tabId);
    },
    [closeTabById]
  );

  const handleReorderTab = useCallback((tabId: string, toIndex: number) => {
    setTabs((prev) => {
      const fromIndex = prev.findIndex((item) => item.tabId === tabId);
      if (
        fromIndex === -1 ||
        fromIndex === toIndex ||
        toIndex < 0 ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const stableTerminalTabs = useMemo(
    () => [...tabs].sort((a, b) => a.tabId.localeCompare(b.tabId)),
    [tabs]
  );

  const handleCloseOtherTabs = useCallback((keepTabId: string) => {
    setTabs((prev) => {
      for (const tab of prev) {
        if (tab.tabId !== keepTabId) {
          tauriApi.sessionDisconnect(tab.tabId).catch(() => {});
        }
      }
      return prev.filter((tab) => tab.tabId === keepTabId);
    });
    setActiveTabId(keepTabId);
  }, []);

  const handleDuplicateTab = useCallback(
    (tab: TerminalTabItem) => {
      if (tab.hostId === "local") {
        handleNewLocalTab(!!tab.isAdmin);
        return;
      }
      const profile = allProfiles.find((p) => p.id === tab.hostId);
      if (profile) {
        void handleConnectHost(profile);
      }
    },
    [allProfiles, handleConnectHost, handleNewLocalTab]
  );

  const handleReconnectTab = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setTabs((prev) =>
        prev.map((tab) =>
          tab.tabId === tabId
            ? {
                ...tab,
                state: "CONNECTING",
                errorMessage: null,
                reconnectToken: tab.reconnectToken + 1,
              }
            : tab
        )
      );
    },
    []
  );

  const handleSessionAck = useCallback(
    (tabId: string, ack: SessionConnectAckDto) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.tabId === tabId ? { ...tab, isAdmin: ack.is_admin } : tab
        )
      );
    },
    []
  );

  const handleElevationCancelled = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.tabId === tabId);
        const nextTabs = prev.filter((t) => t.tabId !== tabId);
        if (activeTabId === tabId && nextTabs.length > 0) {
          setActiveTabId(nextTabs[Math.min(idx, nextTabs.length - 1)].tabId);
        }
        return nextTabs;
      });
    },
    [activeTabId]
  );

  const handleToggleAutoReconnect = useCallback(
    (tabId: string, enabled: boolean) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.tabId === tabId
            ? {
                ...tab,
                autoReconnect: enabled,
              }
            : tab
        )
      );
    },
    []
  );

  const openNewHostModal = useCallback((initialGroup = "Default") => {
    setEditingHost(null);
    setHostModalInitialGroup(initialGroup.trim() || "Default");
    setIsHostModalOpen(true);
  }, []);

  const handleCreateNewHost = useCallback(() => {
    openNewHostModal("Default");
  }, [openNewHostModal]);

  const handleCreateGroup = useCallback(
    async (name: string) => {
      setIsCreatingGroup(true);
      try {
        await tauriApi.hostGroupCreate(name);
        await loadProfiles(searchQuery);
        setIsGroupModalOpen(false);
      } finally {
        setIsCreatingGroup(false);
      }
    },
    [loadProfiles, searchQuery]
  );

  const handleMoveHostToGroup = useCallback(
    async (hostId: string, targetGroup: string) => {
      setAllProfiles((prev) =>
        prev.map((p) =>
          p.id === hostId ? { ...p, group_name: targetGroup } : p
        )
      );
      try {
        await tauriApi.hostMoveGroup(hostId, targetGroup);
        await loadProfiles(searchQuery);
      } catch (err) {
        console.error(err);
        await loadProfiles(searchQuery);
      }
    },
    [loadProfiles, searchQuery]
  );

  const confirmDeleteGroup = async () => {
    if (!deletingGroup) return;
    setDeleteGroupError(null);
    setIsDeletingGroup(true);
    try {
      await tauriApi.hostGroupDelete(deletingGroup);
      setDeletingGroup(null);
      await loadProfiles(searchQuery);
    } catch (err) {
      setDeleteGroupError(formatLocalizedError(err, t));
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const handleEditHost = useCallback(async (hostId: string) => {
    try {
      const detail = await tauriApi.hostGetDetail(hostId);
      setEditingHost(detail);
      setIsHostModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleHostSaved = async (saved: HostFullConfigDto) => {
    await loadProfiles(searchQuery);
    setTabs((prev) =>
      prev.map((tab) =>
        tab.hostId === saved.id
          ? {
              ...tab,
              telemetryEnabled: saved.options.telemetry_enabled,
              autoReconnect: saved.options.auto_reconnect,
              reconnectIntervalSec: saved.options.reconnect_interval_sec,
            }
          : tab
      )
    );
    if (saved.options.telemetry_enabled) {
      const hostTabIds = new Set(
        tabs.filter((t) => t.hostId === saved.id).map((t) => t.tabId)
      );
      if (hostTabIds.size > 0) {
        setHiddenTelemetryTabIds((prev) => {
          const updated = { ...prev };
          let changed = false;
          for (const id of hostTabIds) {
            if (updated[id]) {
              delete updated[id];
              changed = true;
            }
          }
          return changed ? updated : prev;
        });
      }
    }
  };

  const handleDuplicateHost = useCallback(
    async (host: HostProfileSummaryDto) => {
      try {
        await tauriApi.hostDuplicate(host.id, `${host.alias} (Copy)`, host.host);
        await loadProfiles(searchQuery);
      } catch (err) {
        console.error(err);
      }
    },
    [loadProfiles, searchQuery]
  );

  const confirmDeleteHost = async () => {
    if (!deletingHost) return;
    setDeleteHostError(null);
    setIsDeletingHost(true);
    try {
      await tauriApi.hostDelete(deletingHost.id);
      closeDeleteHostModal();
      await loadProfiles(searchQuery);
    } catch (err) {
      setDeleteHostError(formatLocalizedError(err, t));
    } finally {
      setIsDeletingHost(false);
    }
  };

  const isTabOffline = (tab: TerminalTabItem): boolean =>
    tab.state === "DISCONNECTED" ||
    tab.state === "ERROR" ||
    tab.state === "AUTH_FAILED" ||
    tab.state === "PORT_CONFLICT";

  const buildTabLaunchItems = useCallback((): ContextMenuEntry[] => {
    const items: ContextMenuEntry[] = [
      {
        id: "new-tab",
        label: t("ctx.new_tab"),
        icon: <TerminalIcon className="w-3.5 h-3.5 text-sky-400" />,
        shortcut: "Ctrl+Shift+T",
        onSelect: () => handleNewLocalTab(isAppElevated),
      },
    ];
    if (!isAppElevated) {
      items.push({
        id: "new-admin-tab",
        label: t("ctx.new_admin_tab"),
        icon: <Shield className="w-3.5 h-3.5" />,
        highlight: "admin",
        onSelect: () => handleNewLocalTab(true),
      });
    }
    return items;
  }, [handleNewLocalTab, isAppElevated, t]);

  const handleTerminalContextMenu = useCallback(
    (
      e: React.MouseEvent,
      tab: TerminalTabItem,
      actions: TerminalContextActions
    ) => {
      const offline = isTabOffline(tab);
      const items: ContextMenuEntry[] = [
        {
          id: "term-copy",
          label: t("ctx.copy"),
          icon: <ClipboardCopy className="w-3.5 h-3.5" />,
          shortcut: "Ctrl+Shift+C",
          disabled: !actions.hasSelection,
          onSelect: () => void actions.copySelection(),
        },
        {
          id: "term-paste",
          label: t("ctx.paste"),
          icon: <Clipboard className="w-3.5 h-3.5" />,
          shortcut: "Ctrl+Shift+V",
          disabled: offline,
          onSelect: () => void actions.pasteClipboard(),
        },
        {
          id: "term-select-all",
          label: t("ctx.select_all"),
          icon: <TextSelect className="w-3.5 h-3.5" />,
          onSelect: actions.selectAll,
        },
        {
          id: "term-clear",
          label: t("ctx.clear_terminal"),
          icon: <Eraser className="w-3.5 h-3.5" />,
          onSelect: actions.clear,
        },
      ];

      if (tab.hostId !== "local" || offline) {
        items.push(
          { type: "separator", id: "sep-term-reconnect" },
          {
            id: "term-reconnect",
            label: t("common.reconnect"),
            icon: <RotateCw className="w-3.5 h-3.5 text-sky-400" />,
            onSelect: () => handleReconnectTab(tab.tabId),
          }
        );
      }

      const configuredTelemetry =
        tab.hostId === "local"
          ? settings.showLocalTelemetry
          : (tab.telemetryEnabled ?? false);
      if (configuredTelemetry && hiddenTelemetryTabIds[tab.tabId]) {
        items.push(
          { type: "separator", id: "sep-term-telemetry" },
          {
            id: "term-show-telemetry",
            label: t("ctx.show_telemetry"),
            icon: <Eye className="w-3.5 h-3.5 text-emerald-400" />,
            onSelect: () => {
              setHiddenTelemetryTabIds((prev) => {
                if (!prev[tab.tabId]) return prev;
                const next = { ...prev };
                delete next[tab.tabId];
                return next;
              });
              actions.focus();
            },
          }
        );
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      handleReconnectTab,
      hiddenTelemetryTabIds,
      settings.showLocalTelemetry,
      t,
    ]
  );

  const handleTelemetryContextMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      const items: ContextMenuEntry[] = [
        {
          id: "telemetry-hide",
          label: t("ctx.hide_telemetry"),
          icon: <EyeOff className="w-3.5 h-3.5 text-slate-400" />,
          onSelect: () => {
            setHiddenTelemetryTabIds((prev) => ({
              ...prev,
              [tab.tabId]: true,
            }));
            focusActiveTerminal();
          },
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [focusActiveTerminal, t]
  );

  const handleTerminalBannerContextMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      const selected = window.getSelection()?.toString() ?? "";
      const items: ContextMenuEntry[] = [];
      if (selected.length > 0) {
        items.push(
          {
            id: "banner-copy",
            label: t("ctx.copy"),
            icon: <ClipboardCopy className="w-3.5 h-3.5" />,
            shortcut: "Ctrl+C",
            onSelect: () => void copyText(selected),
          },
          { type: "separator", id: "sep-banner" }
        );
      }
      items.push({
        id: "banner-reconnect",
        label: t("common.reconnect"),
        icon: <RotateCw className="w-3.5 h-3.5 text-sky-400" />,
        onSelect: () => handleReconnectTab(tab.tabId),
      });
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [handleReconnectTab, t]
  );

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: TerminalTabItem) => {
      const items: ContextMenuEntry[] = [
        {
          id: "tab-duplicate",
          label: t("ctx.duplicate_tab"),
          icon: <CopyPlus className="w-3.5 h-3.5" />,
          onSelect: () => handleDuplicateTab(tab),
        },
        ...(tab.hostId !== "local" || isTabOffline(tab)
          ? [
              {
                id: "tab-reconnect",
                label: t("common.reconnect"),
                icon: <RotateCw className="w-3.5 h-3.5 text-sky-400" />,
                onSelect: () => handleReconnectTab(tab.tabId),
              } as ContextMenuEntry,
            ]
          : []),
        { type: "separator", id: "sep-tab-1" },
        ...buildTabLaunchItems(),
        { type: "separator", id: "sep-tab-2" },
        {
          id: "tab-close",
          label: t("ctx.close_tab"),
          icon: <X className="w-3.5 h-3.5" />,
          onSelect: () => closeTabById(tab.tabId),
        },
        ...(tabs.length > 1
          ? [
              {
                id: "tab-close-others",
                label: t("ctx.close_other_tabs"),
                icon: <XCircle className="w-3.5 h-3.5" />,
                onSelect: () => handleCloseOtherTabs(tab.tabId),
              } as ContextMenuEntry,
            ]
          : []),
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      buildTabLaunchItems,
      closeTabById,
      handleCloseOtherTabs,
      handleDuplicateTab,
      handleReconnectTab,
      t,
      tabs.length,
    ]
  );

  const handleTabBarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const items: ContextMenuEntry[] = [
        ...buildTabLaunchItems(),
        { type: "separator", id: "sep-tabbar" },
        {
          id: "tabbar-palette",
          label: t("ctx.quick_jump"),
          icon: <Search className="w-3.5 h-3.5 text-sky-400" />,
          shortcut: "Ctrl+Shift+K",
          onSelect: () => setIsPaletteOpen(true),
        },
        {
          id: "tabbar-settings",
          label: t("ctx.settings"),
          icon: <SettingsIcon className="w-3.5 h-3.5 text-slate-300" />,
          onSelect: () => setIsSettingsOpen(true),
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [buildTabLaunchItems, t]
  );

  const handleHostContextMenu = useCallback(
    (e: React.MouseEvent, host: HostProfileSummaryDto) => {
      const items: ContextMenuEntry[] = [
        {
          id: "host-connect",
          label: t("common.connect"),
          icon: <Play className="w-3.5 h-3.5 text-emerald-400" />,
          onSelect: () => {
            void handleConnectHost(host);
            setIsSidebarOpen(false);
          },
        },
        {
          id: "host-edit",
          label: t("common.edit"),
          icon: <Edit2 className="w-3.5 h-3.5 text-sky-400" />,
          onSelect: () => void handleEditHost(host.id),
        },
        {
          id: "host-duplicate",
          label: t("common.duplicate"),
          icon: <CopyPlus className="w-3.5 h-3.5" />,
          onSelect: () => void handleDuplicateHost(host),
        },
        { type: "separator", id: "sep-host-1" },
        {
          id: "host-delete",
          label: t("common.delete"),
          icon: <Trash2 className="w-3.5 h-3.5" />,
          danger: true,
          onSelect: () => requestDeleteHost(host),
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [handleConnectHost, handleDuplicateHost, handleEditHost, requestDeleteHost, t]
  );

  const handleSidebarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const items: ContextMenuEntry[] = [
        {
          id: "sidebar-new-connection",
          label: t("ctx.new_connection"),
          icon: <Plus className="w-3.5 h-3.5 text-emerald-400" />,
          onSelect: handleCreateNewHost,
        },
        {
          id: "sidebar-new-group",
          label: t("ctx.new_group"),
          icon: <FolderPlus className="w-3.5 h-3.5 text-sky-400" />,
          onSelect: () => setIsGroupModalOpen(true),
        },
        {
          id: "sidebar-key-vault",
          label: t("vault.title"),
          icon: <KeyRound className="w-3.5 h-3.5 text-emerald-400" />,
          onSelect: () => setIsVaultOpen(true),
        },
        { type: "separator", id: "sep-sidebar" },
        {
          id: "sidebar-settings",
          label: t("ctx.settings"),
          icon: <SettingsIcon className="w-3.5 h-3.5 text-slate-300" />,
          onSelect: () => setIsSettingsOpen(true),
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [handleCreateNewHost, t]
  );

  const handleGroupContextMenu = useCallback(
    (e: React.MouseEvent, groupName: string) => {
      const items: ContextMenuEntry[] = [
        {
          id: "group-new-connection",
          label: t("ctx.new_connection_in_group", { group: groupName }),
          icon: <Plus className="w-3.5 h-3.5 text-emerald-400" />,
          onSelect: () => openNewHostModal(groupName),
        },
        {
          id: "group-new-group",
          label: t("ctx.new_group"),
          icon: <FolderPlus className="w-3.5 h-3.5 text-sky-400" />,
          onSelect: () => setIsGroupModalOpen(true),
        },
      ];
      if (groupName.trim().toLowerCase() !== "default") {
        items.push(
          { type: "separator", id: "sep-group-delete" },
          {
            id: "group-delete",
            label: t("ctx.delete_group"),
            icon: <Trash2 className="w-3.5 h-3.5" />,
            danger: true,
            onSelect: () => {
              setDeleteGroupError(null);
              setDeletingGroup(groupName);
            },
          }
        );
      }
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [openNewHostModal, t]
  );

  const openGeneralContextMenuRef = useRef<(e: MouseEvent) => void>();
  openGeneralContextMenuRef.current = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const editable = getEditableInput(target);

    if (editable) {
      const start = editable.selectionStart ?? 0;
      const end = editable.selectionEnd ?? 0;
      const selected = editable.value.slice(start, end);
      const hasSel = selected.length > 0;
      const isReadOnly = editable.readOnly || editable.disabled;
      const isPassword = editable instanceof HTMLInputElement && editable.type === "password";

      const items: ContextMenuEntry[] = [
        ...(!isPassword
          ? [
              {
                id: "input-cut",
                label: t("ctx.cut"),
                icon: <Scissors className="w-3.5 h-3.5" />,
                shortcut: "Ctrl+X",
                disabled: !hasSel || isReadOnly,
                onSelect: () => {
                  void copyText(selected);
                  replaceInputSelection(editable, "");
                },
              } as ContextMenuEntry,
              {
                id: "input-copy",
                label: t("ctx.copy"),
                icon: <ClipboardCopy className="w-3.5 h-3.5" />,
                shortcut: "Ctrl+C",
                disabled: !hasSel,
                onSelect: () => void copyText(selected),
              } as ContextMenuEntry,
            ]
          : []),
        {
          id: "input-paste",
          label: t("ctx.paste"),
          icon: <Clipboard className="w-3.5 h-3.5" />,
          shortcut: "Ctrl+V",
          disabled: isReadOnly,
          onSelect: () => {
            void readText().then((txt) => {
              if (txt) replaceInputSelection(editable, txt);
            });
          },
        },
        {
          id: "input-select-all",
          label: t("ctx.select_all"),
          icon: <TextSelect className="w-3.5 h-3.5" />,
          shortcut: "Ctrl+A",
          disabled: editable.value.length === 0,
          onSelect: () => {
            editable.focus();
            editable.select();
          },
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
      return;
    }

    const docSelection = window.getSelection()?.toString() ?? "";

    // Inside modals or form controls: only offer Copy when text is selected; suppress workspace menu.
    if (
      target?.closest("[data-modal-root='true']") ||
      target?.closest("button, select, input, label")
    ) {
      if (docSelection.length > 0) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            {
              id: "modal-copy",
              label: t("ctx.copy"),
              icon: <ClipboardCopy className="w-3.5 h-3.5" />,
              shortcut: "Ctrl+C",
              onSelect: () => void copyText(docSelection),
            },
          ],
        });
      } else {
        setContextMenu(null);
      }
      return;
    }

    const items: ContextMenuEntry[] = [
      ...(docSelection.length > 0
        ? [
            {
              id: "gen-copy",
              label: t("ctx.copy"),
              icon: <ClipboardCopy className="w-3.5 h-3.5" />,
              shortcut: "Ctrl+C",
              onSelect: () => void copyText(docSelection),
            } as ContextMenuEntry,
            { type: "separator", id: "sep-gen-copy" } as ContextMenuEntry,
          ]
        : []),
      ...buildTabLaunchItems(),
      {
        id: "gen-new-connection",
        label: t("ctx.new_connection"),
        icon: <Plus className="w-3.5 h-3.5 text-emerald-400" />,
        onSelect: handleCreateNewHost,
      },
      {
        id: "gen-palette",
        label: t("ctx.quick_jump"),
        icon: <Search className="w-3.5 h-3.5 text-sky-400" />,
        shortcut: "Ctrl+Shift+K",
        onSelect: () => setIsPaletteOpen(true),
      },
      { type: "separator", id: "sep-gen-2" },
      {
        id: "gen-settings",
        label: t("ctx.settings"),
        icon: <SettingsIcon className="w-3.5 h-3.5 text-slate-300" />,
        onSelect: () => setIsSettingsOpen(true),
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Replace native Chromium/WebView2 context menu everywhere in the app
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      openGeneralContextMenuRef.current?.(e);
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  const hasBlockingModal =
    isHostModalOpen ||
    isVaultOpen ||
    isSettingsOpen ||
    isGroupModalOpen ||
    !!authPrompt ||
    !!hostKeyPrompt ||
    portConflicts.length > 0 ||
    !!deletingHost ||
    !!deletingGroup;

  hasBlockingModalRef.current = hasBlockingModal;

  const hasModalOpen = hasBlockingModal || isPaletteOpen;
  hasAnyModalRef.current = hasModalOpen;

  const suppressTerminalFocus =
    hasModalOpen || isSidebarOpen || !!contextMenu;

  useEffect(() => {
    if (!isSidebarOpen || hasModalOpen || !!contextMenu) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismissSidebar();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [isSidebarOpen, hasModalOpen, contextMenu, handleDismissSidebar]);

  return (
    <div
      className={`h-full w-full flex flex-col bg-[#090d16] text-slate-100 overflow-hidden relative ${
        hasNativeBorder ? "" : "border border-slate-800"
      }`}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        isAppElevated={isAppElevated}
        isModalOpen={hasModalOpen}
        profiles={allProfiles}
        onToggleSidebar={handleToggleSidebar}
        onSelectTab={handleSelectTab}
        onBlankSpaceClick={handleDismissSidebar}
        onCloseTab={handleCloseTab}
        onReconnectTab={handleReconnectTab}
        onReorderTab={handleReorderTab}
        onNewTab={handleNewLocalTab}
        onConnectProfile={handleConnectHost}
        onCreateNewHost={handleCreateNewHost}
        onContextMenuTab={handleTabContextMenu}
        onContextMenuTabBar={handleTabBarContextMenu}
      />

      <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden z-10">
        {stableTerminalTabs.map((tab) => {
          const configuredTelemetry =
            tab.hostId === "local"
              ? settings.showLocalTelemetry
              : (tab.telemetryEnabled ?? false);
          return (
            <TerminalViewport
              key={tab.tabId}
              tab={tab}
              isActive={tab.tabId === activeTabId}
              launchCols={settings.launchCols}
              launchRows={settings.launchRows}
              showTelemetry={
                configuredTelemetry && !hiddenTelemetryTabIds[tab.tabId]
              }
              telemetry={telemetryByHost[tab.hostId]}
              focusToken={focusToken}
              suppressAutoFocus={suppressTerminalFocus}
              onReconnect={handleReconnectTab}
              onToggleAutoReconnect={handleToggleAutoReconnect}
              onSessionAck={handleSessionAck}
              onElevationCancelled={handleElevationCancelled}
              onContextMenuTerminal={handleTerminalContextMenu}
              onContextMenuBanner={handleTerminalBannerContextMenu}
              onContextMenuTelemetry={handleTelemetryContextMenu}
            />
          );
        })}

        <HostSidebar
          isOpen={isSidebarOpen}
          onClose={handleDismissSidebar}
          profiles={filteredProfiles}
          groups={dbGroups}
          isFiltering={Boolean(searchQuery.trim() || selectedTag)}
          allTags={allTags}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onConnectHost={handleConnectHost}
          onCreateNew={handleCreateNewHost}
          onOpenVault={() => setIsVaultOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onEditHost={handleEditHost}
          onDuplicateHost={handleDuplicateHost}
          onDeleteHost={requestDeleteHost}
          onMoveHostToGroup={handleMoveHostToGroup}
          onContextMenuHost={handleHostContextMenu}
          onContextMenuGroup={handleGroupContextMenu}
          onContextMenuSidebar={handleSidebarContextMenu}
        />

        <Suspense fallback={null}>
          {isHostModalOpen && (
            <HostModal
              isOpen={isHostModalOpen}
              editingHost={editingHost}
              initialGroupName={hostModalInitialGroup}
              existingGroups={existingGroups}
              keysVersion={keysVersion}
              onOpenKeyVault={() => setIsVaultOpen(true)}
              onClose={() => setIsHostModalOpen(false)}
              onSaved={handleHostSaved}
            />
          )}

          {isVaultOpen && (
            <KeyVaultModal
              isOpen={isVaultOpen}
              onClose={() => setIsVaultOpen(false)}
              onKeysChanged={() => {
                setKeysVersion((v) => v + 1);
                void loadProfiles(searchQuery);
              }}
            />
          )}

          {isSettingsOpen && (
            <SettingsModal
              isOpen={isSettingsOpen}
              settings={settings}
              onClose={() => setIsSettingsOpen(false)}
              onSave={handleSaveSettings}
            />
          )}

          {(authPrompt || hostKeyPrompt) && (
            <AuthPromptModal
              authPrompt={authPrompt}
              hostKeyPrompt={hostKeyPrompt}
              onCloseAuth={() => setAuthPrompt(null)}
              onCloseHostKey={() => setHostKeyPrompt(null)}
              onReconnectTab={handleReconnectTab}
            />
          )}

          {portConflicts.length > 0 && (
            <PortConflictModal
              conflicts={portConflicts}
              onSkipAndConnect={() => {
                const host = pendingConflictHost;
                setPortConflicts([]);
                setPendingConflictHost(null);
                if (host) {
                  spawnHostTab(host, "AUTO_SHARE_OR_SKIP");
                }
              }}
              onAbort={() => {
                setPortConflicts([]);
                setPendingConflictHost(null);
              }}
            />
          )}

          {isPaletteOpen && (
            <CommandPalette
              isOpen={isPaletteOpen}
              profiles={allProfiles}
              onClose={() => setIsPaletteOpen(false)}
              onSelectHost={handleConnectHost}
            />
          )}

          {deletingHost && (
            <ConfirmDeleteModal
              isOpen={!!deletingHost}
              title={t("host.delete_confirm")}
              itemName={deletingHost.alias}
              itemDetail={`${deletingHost.username}@${deletingHost.host}:${deletingHost.port}`}
              note={t("host.delete_warning")}
              noteTone="neutral"
              errorMessage={deleteHostError}
              isDeleting={isDeletingHost}
              onCancel={closeDeleteHostModal}
              onConfirm={confirmDeleteHost}
            />
          )}

          {isGroupModalOpen && (
            <GroupModal
              isOpen={isGroupModalOpen}
              existingGroups={dbGroups}
              isSubmitting={isCreatingGroup}
              onClose={() => setIsGroupModalOpen(false)}
              onCreateGroup={handleCreateGroup}
            />
          )}

          {deletingGroup && (
            <ConfirmDeleteModal
              isOpen={!!deletingGroup}
              title={t("group.delete_confirm", { name: deletingGroup })}
              itemName={deletingGroup}
              note={t("group.delete_warning")}
              noteTone="neutral"
              errorMessage={deleteGroupError}
              isDeleting={isDeletingGroup}
              onCancel={() => {
                setDeletingGroup(null);
                setDeleteGroupError(null);
              }}
              onConfirm={confirmDeleteGroup}
            />
          )}
        </Suspense>
      </div>

      {contextMenu && (
        <Suspense fallback={null}>
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
