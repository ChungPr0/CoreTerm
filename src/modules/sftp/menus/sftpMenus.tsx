import {
  Copy,
  Download,
  Edit3,
  FolderOpen,
  FolderPlus,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { SftpTransferJobDto } from "../types";
import type { ContextMenuEntry } from "@/shared/ui";
import type { FileItem } from "../components/FileList";

interface BuildPaneMenuOpts {
  kind: "local" | "remote";
  cwd: string;
  item: FileItem | null;
  selected: string[];
  connected: boolean;
  showLocal: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onOpenDir: (path: string) => void;
  onTransfer: (paths: string[]) => void;
  onUploadFiles?: () => void;
  onUploadFolder?: () => void;
  onNewFolder: () => void;
  onRename: (item: FileItem) => void;
  onChmod?: (item: FileItem) => void;
  onCopyPath: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onRefresh: () => void;
}

export function buildPaneMenu(opts: BuildPaneMenuOpts): ContextMenuEntry[] {
  const {
    kind,
    cwd,
    item,
    selected,
    connected,
    showLocal,
    t,
    onOpenDir,
    onTransfer,
    onUploadFiles,
    onUploadFolder,
    onNewFolder,
    onRename,
    onChmod,
    onCopyPath,
    onDelete,
    onRefresh,
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
    entries.push(
      {
        id: `${kind}-mkdir`,
        label: t("ctx.sftp_new_folder"),
        icon: <FolderPlus className="h-3.5 w-3.5" />,
        disabled: remoteLocked,
        onSelect: onNewFolder,
      },
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
    return entries;
  }

  const targets = selected.includes(item.path) ? selected : [item.path];

  if (targets.length > 1) {
    const count = targets.length;
    const transferLabel = isRemote
      ? t(showLocal ? "ctx.sftp_download_count" : "ctx.sftp_download_count_to", { count })
      : t("ctx.sftp_upload_count", { count });
    return [
      {
        id: `${kind}-transfer-multi`,
        label: transferLabel,
        icon: isRemote ? <Download className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />,
        disabled: !connected,
        onSelect: () => onTransfer(targets),
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
      },
    ];
  }

  const entries: ContextMenuEntry[] = [];
  if (item.isDir) {
    entries.push({
      id: `${kind}-open`,
      label: t("ctx.sftp_open"),
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      disabled: remoteLocked,
      onSelect: () => onOpenDir(item.path),
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

interface BuildQueueMenuOpts {
  job: SftpTransferJobDto | null;
  hasFinished: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onClearFinished: () => void;
}

export function buildQueueMenu(opts: BuildQueueMenuOpts): ContextMenuEntry[] {
  const { job, hasFinished, t, onPause, onResume, onCancel, onClearFinished } = opts;
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
  }

  if (hasFinished) {
    if (entries.length > 0) entries.push({ type: "separator", id: "queue-sep" });
    entries.push({
      id: "queue-clear",
      label: t("sftp.queue_clear"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onSelect: onClearFinished,
    });
  }

  return entries;
}
