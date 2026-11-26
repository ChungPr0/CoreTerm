import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Columns2,
  Copy,
  Download,
  Edit3,
  FileCode2,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderSync,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  Settings as SettingsIcon,
  Shield,
  Terminal,
  TextSelect,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import type { ContextMenuEntry } from "@/shared/ui";
import { getShortcutChord } from "@/shared/utils/shortcuts";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import type { SortDir, SortKey } from "../hooks/fileListUtils";
import type { FileItem, SftpConnectionState, SftpTransferJobDto } from "../types";

export interface BuildToolbarMenuOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  mode?: "split" | "full";
  connState?: SftpConnectionState;
  canConnect?: boolean;
  showLocal?: boolean;
  remoteCwd?: string;
  onReconnect: () => void;
  onRefresh?: () => void;
  onToggleLocalPane?: () => void;
  onCopyRemotePath?: (path: string) => void;
  onOpenInTerminal?: (remotePath: string) => void;
  onOpenSftpTab?: () => void;
  onOpenSshTab?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export interface BuildPaneMenuOpts {
  kind: "local" | "remote";
  mode?: "split" | "full";
  cwd: string;
  item: FileItem | null;
  selected: string[];
  hasItems?: boolean;
  connected: boolean;
  showLocal: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onOpenDir: (path: string) => void;
  onEditFile?: (item: FileItem) => void;
  onTransfer: (paths: string[]) => void;
  onUploadFiles?: () => void;
  onUploadFolder?: () => void;
  onNewFile?: () => void;
  onNewFolder: () => void;
  onRename: (item: FileItem) => void;
  onChmod?: (item: FileItem) => void;
  onCopyPath: (path: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onOpenInTerminal?: (remotePath: string) => void;
  onDelete: (paths: string[]) => void;
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export interface BuildColumnHeaderMenuOpts {
  kind: "local" | "remote";
  connected: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  t: (key: string, params?: Record<string, string | number>) => string;
  onSort: (key: SortKey) => void;
  onResetCols: () => void;
  onRefresh: () => void;
}

export interface BuildQueueMenuOpts {
  job: SftpTransferJobDto | null;
  hasFinished: boolean;
  expanded?: boolean;
  jobsCount?: number;
  mode?: "split" | "full";
  isConnecting?: boolean;
  canConnect?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onClearFinished: () => void;
  onToggleExpand?: () => void;
  onCopyPath?: (path: string) => void;
  onReconnect?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export interface BuildSftpBannerMenuOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  mode: "split" | "full";
  selectedText: string;
  isConnecting: boolean;
  onCopy: (text: string) => void;
  onReconnect: () => void;
  onOpenSshTab?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export interface BuildSplitDividerMenuOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  onResetSplit: () => void;
  showLocal?: boolean;
  onToggleLocalPane?: () => void;
  onOpenSftpTab?: () => void;
  onClosePanel?: () => void;
}

function appendSftpFooterItems(
  entries: ContextMenuEntry[],
  opts: {
    t: (key: string, params?: Record<string, string | number>) => string;
    mode?: "split" | "full";
    onOpenSettings?: () => void;
    onClose?: () => void;
    sepId: string;
    idPrefix: string;
    omitSeparator?: boolean;
  }
) {
  if (!opts.onOpenSettings && !opts.onClose) return;
  const kb = useSettingsStore.getState().settings.keybindings;
  if (!opts.omitSeparator && entries.length > 0) {
    entries.push({ type: "separator", id: opts.sepId });
  }
  if (opts.onOpenSettings) {
    entries.push({
      id: `${opts.idPrefix}-settings`,
      label: opts.t("ctx.settings"),
      icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
      shortcut: getShortcutChord("openSettings", kb),
      onSelect: opts.onOpenSettings,
    });
  }
  if (opts.onClose) {
    const isSplit = opts.mode === "split";
    entries.push({
      id: `${opts.idPrefix}-close`,
      label: isSplit ? opts.t("ctx.close_sftp_panel") : opts.t("ctx.close_tab"),
      icon: <X className="h-3.5 w-3.5" />,
      shortcut: isSplit
        ? getShortcutChord("toggleSftpPanel", kb)
        : getShortcutChord("closeTab", kb),
      onSelect: opts.onClose,
    });
  }
}

export function buildToolbarMenu(opts: BuildToolbarMenuOpts): ContextMenuEntry[] {
  const {
    t,
    mode = "split",
    connState,
    canConnect = true,
    showLocal,
    remoteCwd = "",
    onReconnect,
    onRefresh,
    onToggleLocalPane,
    onCopyRemotePath,
    onOpenInTerminal,
    onOpenSftpTab,
    onOpenSshTab,
    onOpenSettings,
    onClose,
  } = opts;

  const isConnecting = connState === "CONNECTING";
  const remoteDisconnected = connState !== undefined && connState !== "CONNECTED";

  const entries: ContextMenuEntry[] = [
    {
      id: "sftp-reconnect",
      label: t("sftp.reconnect"),
      icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
      disabled: isConnecting || !canConnect,
      onSelect: onReconnect,
    },
  ];

  if (onRefresh) {
    entries.push({
      id: "sftp-toolbar-refresh",
      label: t("sftp.refresh"),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      disabled: remoteDisconnected && !showLocal,
      onSelect: onRefresh,
    });
  }

  if (onToggleLocalPane && typeof showLocal === "boolean") {
    entries.push({
      id: "sftp-toolbar-local-pane",
      label: t("sftp.toggle_local_pane"),
      icon: <Columns2 className="h-3.5 w-3.5" />,
      badge: {
        text: showLocal ? t("ctx.state_on") : t("ctx.state_off"),
        active: showLocal,
      },
      onSelect: onToggleLocalPane,
    });
  }

  if (onCopyRemotePath) {
    entries.push({
      id: "sftp-toolbar-copy-cwd",
      label: t("ctx.sftp_copy_path"),
      icon: <Copy className="h-3.5 w-3.5" />,
      disabled: !remoteCwd,
      onSelect: () => {
        if (remoteCwd) onCopyRemotePath(remoteCwd);
      },
    });
  }

  if (mode === "split" && onOpenInTerminal) {
    entries.push({
      id: "sftp-toolbar-open-term",
      label: t("sftp.open_in_terminal"),
      icon: <Terminal className="h-3.5 w-3.5 text-emerald-400" />,
      disabled: !remoteCwd || remoteDisconnected,
      onSelect: () => {
        if (remoteCwd) onOpenInTerminal(remoteCwd);
      },
    });
  }

  if (mode === "split" && onOpenSftpTab) {
    entries.push({
      id: "sftp-toolbar-open-sftp-tab",
      label: t("ctx.sftp_open_tab"),
      icon: <FolderSync className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: onOpenSftpTab,
    });
  } else if (mode === "full" && onOpenSshTab) {
    entries.push({
      id: "sftp-toolbar-open-ssh",
      label: t("ctx.ssh_open_tab"),
      icon: <Server className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: onOpenSshTab,
    });
  }

  appendSftpFooterItems(entries, {
    t,
    mode,
    onOpenSettings,
    onClose,
    sepId: "sep-sftp-toolbar-common",
    idPrefix: "sftp-toolbar",
  });

  return entries;
}

export function buildPaneMenu(opts: BuildPaneMenuOpts): ContextMenuEntry[] {
  const {
    kind,
    mode = "split",
    cwd,
    item,
    selected,
    hasItems = true,
    connected,
    showLocal,
    t,
    onOpenDir,
    onEditFile,
    onTransfer,
    onUploadFiles,
    onUploadFolder,
    onNewFile,
    onNewFolder,
    onRename,
    onChmod,
    onCopyPath,
    onSelectAll,
    onClearSelection,
    onOpenInTerminal,
    onDelete,
    onRefresh,
    onOpenSettings,
    onClose,
  } = opts;

  const isRemote = kind === "remote";
  const remoteLocked = isRemote && !connected;

  if (!item) {
    const entries: ContextMenuEntry[] = [];
    if (isRemote && onUploadFiles && onUploadFolder) {
      entries.push(
        {
          id: "remote-upload-files",
          label: t("sftp.upload_files"),
          icon: <Upload className="h-3.5 w-3.5" />,
          disabled: !connected,
          onSelect: onUploadFiles,
        },
        {
          id: "remote-upload-folder",
          label: t("sftp.upload_folder"),
          icon: <FolderPlus className="h-3.5 w-3.5" />,
          disabled: !connected,
          onSelect: onUploadFolder,
        },
        { type: "separator", id: "remote-empty-sep" }
      );
    }
    if (onNewFile) {
      entries.push({
        id: `${kind}-new-file`,
        label: t("ctx.sftp_new_file"),
        icon: <FilePlus className="h-3.5 w-3.5" />,
        disabled: remoteLocked,
        onSelect: onNewFile,
      });
    }
    entries.push({
      id: `${kind}-mkdir`,
      label: t("ctx.sftp_new_folder"),
      icon: <FolderPlus className="h-3.5 w-3.5" />,
      disabled: remoteLocked,
      onSelect: onNewFolder,
    });

    if (onSelectAll) {
      entries.push({
        id: `${kind}-select-all`,
        label: t("ctx.select_all"),
        icon: <TextSelect className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+A",
        disabled: remoteLocked || !hasItems,
        onSelect: onSelectAll,
      });
    }

    if (onClearSelection && selected.length > 0) {
      entries.push({
        id: `${kind}-clear-selection`,
        label: t("ctx.clear_selection"),
        icon: <XCircle className="h-3.5 w-3.5" />,
        onSelect: onClearSelection,
      });
    }

    entries.push(
      {
        id: `${kind}-refresh`,
        label: t("sftp.refresh"),
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        disabled: remoteLocked,
        onSelect: onRefresh,
      },
      {
        id: `${kind}-copy-cwd`,
        label: t("ctx.sftp_copy_path"),
        icon: <Copy className="h-3.5 w-3.5" />,
        disabled: !cwd,
        onSelect: () => onCopyPath(cwd),
      }
    );

    if (isRemote && onOpenInTerminal) {
      entries.push({
        id: "remote-cwd-open-terminal",
        label: t("sftp.open_in_terminal"),
        icon: <Terminal className="h-3.5 w-3.5 text-emerald-400" />,
        disabled: !connected || !cwd,
        onSelect: () => onOpenInTerminal(cwd),
      });
    }

    appendSftpFooterItems(entries, {
      t,
      mode,
      onOpenSettings,
      onClose,
      sepId: `${kind}-empty-common-sep`,
      idPrefix: kind,
    });

    return entries;
  }

  const targets = selected.includes(item.path) ? selected : [item.path];

  if (targets.length > 1) {
    const count = targets.length;
    const transferLabel = isRemote
      ? t(showLocal ? "ctx.sftp_download_count" : "ctx.sftp_download_count_to", { count })
      : t("ctx.sftp_upload_count", { count });
    const entries: ContextMenuEntry[] = [
      {
        id: `${kind}-transfer-multi`,
        label: transferLabel,
        icon: isRemote ? <Download className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />,
        disabled: !connected,
        onSelect: () => onTransfer(targets),
      },
      {
        id: `${kind}-copy-paths`,
        label: t("ctx.sftp_copy_path"),
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => onCopyPath(targets.join("\n")),
      },
    ];

    if (onSelectAll) {
      entries.push({
        id: `${kind}-select-all`,
        label: t("ctx.select_all"),
        icon: <TextSelect className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+A",
        disabled: remoteLocked,
        onSelect: onSelectAll,
      });
    }

    entries.push(
      {
        id: `${kind}-refresh`,
        label: t("sftp.refresh"),
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        disabled: remoteLocked,
        onSelect: onRefresh,
      },
      { type: "separator", id: `${kind}-multi-sep` },
      {
        id: `${kind}-delete-multi`,
        label: t("ctx.sftp_delete_count", { count }),
        icon: <Trash2 className="h-3.5 w-3.5" />,
        shortcut: "Del",
        danger: true,
        disabled: remoteLocked,
        onSelect: () => onDelete(targets),
      }
    );

    return entries;
  }

  const entries: ContextMenuEntry[] = [];
  if (item.isDir) {
    entries.push({
      id: `${kind}-open`,
      label: t("ctx.sftp_open"),
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      shortcut: "Enter",
      disabled: remoteLocked,
      onSelect: () => onOpenDir(item.path),
    });
    if (isRemote && onOpenInTerminal) {
      entries.push({
        id: "remote-open-terminal",
        label: t("sftp.open_in_terminal"),
        icon: <Terminal className="h-3.5 w-3.5 text-emerald-400" />,
        disabled: !connected,
        onSelect: () => onOpenInTerminal(item.path),
      });
    }
  } else if (onEditFile) {
    entries.push({
      id: `${kind}-edit`,
      label: t("ctx.sftp_edit"),
      icon: <FileCode2 className="h-3.5 w-3.5 text-[#58a6ff]" />,
      shortcut: "Enter",
      disabled: remoteLocked,
      onSelect: () => onEditFile(item),
    });
  }

  entries.push(
    {
      id: `${kind}-transfer`,
      label: isRemote
        ? t(showLocal ? "ctx.sftp_download" : "ctx.sftp_download_to")
        : t("ctx.sftp_upload"),
      icon: isRemote ? <Download className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />,
      disabled: !connected,
      onSelect: () => onTransfer(targets),
    },
    { type: "separator", id: `${kind}-sep-1` },
    {
      id: `${kind}-rename`,
      label: t("ctx.sftp_rename"),
      icon: <Edit3 className="h-3.5 w-3.5" />,
      shortcut: "F2",
      disabled: remoteLocked,
      onSelect: () => onRename(item),
    }
  );

  if (isRemote && onChmod) {
    entries.push({
      id: "remote-chmod",
      label: t("ctx.sftp_chmod"),
      icon: <Shield className="h-3.5 w-3.5" />,
      disabled: !connected,
      onSelect: () => onChmod(item),
    });
  }

  entries.push(
    {
      id: `${kind}-copy-path`,
      label: t("ctx.sftp_copy_path"),
      icon: <Copy className="h-3.5 w-3.5" />,
      onSelect: () => onCopyPath(item.path),
    },
    { type: "separator", id: `${kind}-sep-del` },
    {
      id: `${kind}-delete`,
      label: t("ctx.sftp_delete"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      shortcut: "Del",
      danger: true,
      disabled: remoteLocked,
      onSelect: () => onDelete(targets),
    }
  );

  return entries;
}

export function buildColumnHeaderMenu({
  kind,
  connected,
  sortKey,
  sortDir,
  t,
  onSort,
  onResetCols,
  onRefresh,
}: BuildColumnHeaderMenuOpts): ContextMenuEntry[] {
  const sortCols: Array<{ key: SortKey; labelKey: string }> = [
    { key: "name", labelKey: "sftp.col_name" },
    { key: "size", labelKey: "sftp.col_size" },
    { key: "mtime", labelKey: "sftp.col_modified" },
  ];

  const entries: ContextMenuEntry[] = sortCols.map((col) => {
    const isCurrent = sortKey === col.key;
    const icon = isCurrent ? (
      sortDir === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5 text-sky-400" />
      ) : (
        <ArrowDown className="h-3.5 w-3.5 text-sky-400" />
      )
    ) : (
      <ArrowUpDown className="h-3.5 w-3.5" />
    );

    return {
      id: `col-sort-${col.key}`,
      label: t("ctx.sort_by", { col: t(col.labelKey) }),
      icon,
      badge: isCurrent
        ? { text: sortDir === "asc" ? "↑" : "↓", active: true }
        : undefined,
      onSelect: () => onSort(col.key),
    };
  });

  entries.push(
    { type: "separator", id: "col-sep-1" },
    {
      id: "col-reset-widths",
      label: t("ctx.reset_columns"),
      icon: <Columns2 className="h-3.5 w-3.5" />,
      onSelect: onResetCols,
    },
    {
      id: "col-refresh",
      label: t("sftp.refresh"),
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      disabled: kind === "remote" && !connected,
      onSelect: onRefresh,
    }
  );

  return entries;
}

export function buildQueueMenu(opts: BuildQueueMenuOpts): ContextMenuEntry[] {
  const {
    job,
    hasFinished,
    expanded = false,
    jobsCount,
    mode = "split",
    isConnecting = false,
    canConnect = true,
    t,
    onPause,
    onResume,
    onCancel,
    onClearFinished,
    onToggleExpand,
    onCopyPath,
    onReconnect,
    onOpenSettings,
    onClose,
  } = opts;
  const entries: ContextMenuEntry[] = [];

  if (job) {
    if (job.status === "RUNNING" || job.status === "QUEUED") {
      entries.push({
        id: "queue-pause",
        label: t("sftp.queue_pause"),
        icon: <Pause className="h-3.5 w-3.5" />,
        onSelect: () => onPause(job.job_id),
      });
    } else if (job.status === "PAUSED") {
      entries.push({
        id: "queue-resume",
        label: t("sftp.queue_resume"),
        icon: <Play className="h-3.5 w-3.5" />,
        onSelect: () => onResume(job.job_id),
      });
    }
    if (job.status === "QUEUED" || job.status === "RUNNING" || job.status === "PAUSED") {
      entries.push({
        id: "queue-cancel",
        label: t("sftp.queue_cancel"),
        icon: <X className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => onCancel(job.job_id),
      });
    }
    if (onCopyPath) {
      if (entries.length > 0) {
        entries.push({ type: "separator", id: "queue-copy-sep" });
      }
      entries.push(
        {
          id: "queue-copy-source",
          label: t("ctx.sftp_copy_source_path"),
          icon: <Copy className="h-3.5 w-3.5" />,
          onSelect: () => onCopyPath(job.source_path),
        },
        {
          id: "queue-copy-dest",
          label: t("ctx.sftp_copy_dest_path"),
          icon: <Copy className="h-3.5 w-3.5" />,
          onSelect: () => onCopyPath(job.dest_path),
        }
      );
    }

    if (entries.length > 0) {
      entries.push({ type: "separator", id: "queue-sep" });
    }
    entries.push({
      id: "queue-clear",
      label: t("sftp.queue_clear"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      disabled: !hasFinished,
      onSelect: onClearFinished,
    });
    return entries;
  }

  if (onToggleExpand) {
    entries.push({
      id: "queue-toggle",
      label: expanded ? t("ctx.collapse_queue") : t("ctx.expand_queue"),
      icon: expanded ? (
        <ChevronDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      ),
      badge:
        typeof jobsCount === "number"
          ? { text: String(jobsCount), active: jobsCount > 0 }
          : undefined,
      onSelect: onToggleExpand,
    });
  }

  entries.push({
    id: "queue-clear",
    label: t("sftp.queue_clear"),
    icon: <Trash2 className="h-3.5 w-3.5" />,
    disabled: !hasFinished,
    onSelect: onClearFinished,
  });

  if (onReconnect) {
    entries.push(
      { type: "separator", id: "sep-queue-common" },
      {
        id: "queue-reconnect",
        label: t("sftp.reconnect"),
        icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
        disabled: isConnecting || !canConnect,
        onSelect: onReconnect,
      }
    );
    appendSftpFooterItems(entries, {
      t,
      mode,
      onOpenSettings,
      onClose,
      sepId: "sep-queue-common",
      idPrefix: "queue",
      omitSeparator: true,
    });
  } else {
    appendSftpFooterItems(entries, {
      t,
      mode,
      onOpenSettings,
      onClose,
      sepId: "sep-queue-common",
      idPrefix: "queue",
    });
  }

  return entries;
}

export function buildSftpBannerMenu({
  t,
  mode,
  selectedText,
  isConnecting,
  onCopy,
  onReconnect,
  onOpenSshTab,
  onOpenSettings,
  onClose,
}: BuildSftpBannerMenuOpts): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  if (selectedText.length > 0) {
    entries.push(
      {
        id: "sftp-banner-copy",
        label: t("ctx.copy"),
        icon: <ClipboardCopy className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+C",
        onSelect: () => onCopy(selectedText),
      },
      { type: "separator", id: "sep-sftp-banner-copy" }
    );
  }
  entries.push({
    id: "sftp-banner-reconnect",
    label: t("sftp.reconnect"),
    icon: <RotateCw className="h-3.5 w-3.5 text-sky-400" />,
    disabled: isConnecting,
    onSelect: onReconnect,
  });

  if (mode === "full" && onOpenSshTab) {
    entries.push({
      id: "sftp-banner-open-ssh",
      label: t("ctx.ssh_open_tab"),
      icon: <Server className="h-3.5 w-3.5 text-emerald-400" />,
      onSelect: onOpenSshTab,
    });
  }

  appendSftpFooterItems(entries, {
    t,
    mode,
    onOpenSettings,
    onClose,
    sepId: "sep-sftp-banner-common",
    idPrefix: "sftp-banner",
  });

  return entries;
}

export function buildSplitDividerMenu({
  t,
  onResetSplit,
  showLocal,
  onToggleLocalPane,
  onOpenSftpTab,
  onClosePanel,
}: BuildSplitDividerMenuOpts): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [
    {
      id: "sftp-split-reset",
      label: t("ctx.reset_split"),
      icon: <RotateCcw className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: onResetSplit,
    },
  ];

  if (onToggleLocalPane && typeof showLocal === "boolean") {
    entries.push({
      id: "sftp-split-toggle-local",
      label: t("sftp.toggle_local_pane"),
      icon: <Columns2 className="h-3.5 w-3.5" />,
      badge: {
        text: showLocal ? t("ctx.state_on") : t("ctx.state_off"),
        active: showLocal,
      },
      onSelect: onToggleLocalPane,
    });
  }

  if (onOpenSftpTab) {
    entries.push({
      id: "sftp-split-open-tab",
      label: t("ctx.sftp_open_tab"),
      icon: <FolderSync className="h-3.5 w-3.5 text-sky-400" />,
      onSelect: onOpenSftpTab,
    });
  }

  if (onClosePanel) {
    entries.push(
      { type: "separator", id: "sep-split-close" },
      {
        id: "sftp-split-close",
        label: t("ctx.close_sftp_panel"),
        icon: <X className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+Shift+E",
        onSelect: onClosePanel,
      }
    );
  }

  return entries;
}
