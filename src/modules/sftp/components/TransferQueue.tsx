import React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { SftpTransferJobDto, SftpTransferStatus } from "../types";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { fmtSize, fmtSpeed } from "@/shared/utils/formatters";

interface TransferQueueProps {
  jobs: SftpTransferJobDto[];
  expanded: boolean;
  onToggleExpand: () => void;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onClearFinished: () => void;
  onContextMenuQueue?: (job: SftpTransferJobDto | null, hasFinished: boolean, e: React.MouseEvent) => void;
}

const STATUS_META: Record<SftpTransferStatus, { key: string; cls: string }> = {
  QUEUED: { key: "sftp.status_queued", cls: "text-[#8b949e] bg-[#21262d]" },
  RUNNING: { key: "sftp.status_running", cls: "text-[#58a6ff] bg-[#1f6feb]/20" },
  PAUSED: { key: "sftp.status_paused", cls: "text-amber-300 bg-amber-500/15" },
  COMPLETED: { key: "sftp.status_completed", cls: "text-emerald-300 bg-emerald-500/15" },
  FAILED: { key: "sftp.status_failed", cls: "text-red-300 bg-red-500/15" },
  CANCELLED: { key: "sftp.status_cancelled", cls: "text-[#8b949e] bg-[#21262d]" },
  SKIPPED: { key: "sftp.status_skipped", cls: "text-[#8b949e] bg-[#21262d]" },
};

const ACTIVE_STATUSES = new Set<SftpTransferStatus>(["QUEUED", "RUNNING", "PAUSED"]);

export const TransferQueue: React.FC<TransferQueueProps> = ({
  jobs,
  expanded,
  onToggleExpand,
  onPause,
  onResume,
  onCancel,
  onClearFinished,
  onContextMenuQueue,
}) => {
  const { t } = useI18n();
  const activeCount = jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length;
  const hasFinished = jobs.some((j) => !ACTIVE_STATUSES.has(j.status));

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenuQueue?.(null, hasFinished, e);
      }}
      className="shrink-0 select-none border-t border-[#21262d] bg-[#0b1016]"
    >
      <div
        onClick={onToggleExpand}
        className="flex h-7 cursor-pointer select-none items-center justify-between px-3 text-xs text-[#c9d1d9] hover:bg-[#161b22]"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="font-medium">{t("sftp.queue_title")}</span>
          <span className="rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] text-[#8b949e]">
            {activeCount > 0 ? `${activeCount} / ${jobs.length}` : jobs.length}
          </span>
        </div>

        {hasFinished && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClearFinished();
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
          >
            <Trash2 className="h-3 w-3" />
            <span>{t("sftp.queue_clear")}</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="max-h-40 overflow-y-auto border-t border-[#21262d] px-3 py-1.5">
          {jobs.length === 0 ? (
            <div className="py-2 text-center text-[11px] text-[#8b949e]">
              {t("sftp.queue_empty")}
            </div>
          ) : (
            <div className="space-y-1.5">
              {jobs.map((job) => {
                const pct =
                  job.total_bytes > 0
                    ? Math.min(100, Math.round((job.transferred_bytes / job.total_bytes) * 100))
                    : job.status === "COMPLETED"
                      ? 100
                      : 0;
                const meta = STATUS_META[job.status];
                const speed = job.status === "RUNNING" ? fmtSpeed(job.speed_bps) : "";
                const errHint = job.error_message ? formatLocalizedError(job.error_message, t) : undefined;
                const canPause = job.status === "RUNNING" || job.status === "QUEUED";
                const canResume = job.status === "PAUSED";
                const canCancel = ACTIVE_STATUSES.has(job.status);

                return (
                  <div
                    key={job.job_id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onContextMenuQueue?.(job, hasFinished, e);
                    }}
                    className="flex items-center gap-2.5 rounded border border-[#21262d] bg-[#11161d] px-2.5 py-1.5 text-xs"
                  >
                    <span
                      className={`shrink-0 rounded p-1 ${
                        job.direction === "UPLOAD"
                          ? "bg-[#1f6feb]/15 text-[#58a6ff]"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {job.direction === "UPLOAD" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-[#e6edf3]" title={`${job.source_path} -> ${job.dest_path}`}>
                          {job.file_name}
                        </span>
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-[#8b949e]">
                          <span>
                            {fmtSize(job.transferred_bytes)} / {fmtSize(job.total_bytes)}
                          </span>
                          {speed && <span className="text-[#58a6ff]">{speed}</span>}
                        </div>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-[#21262d]">
                        <div
                          className={`h-full transition-all ${
                            job.status === "FAILED"
                              ? "bg-red-500"
                              : job.status === "COMPLETED"
                                ? "bg-emerald-500"
                                : "bg-[#388bfd]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}
                      title={errHint}
                    >
                      {t(meta.key)}
                    </span>

                    <div className="flex shrink-0 items-center gap-1">
                      {canPause && (
                        <button
                          type="button"
                          onClick={() => onPause(job.job_id)}
                          className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
                          title={t("sftp.queue_pause")}
                        >
                          <Pause className="h-3 w-3" />
                        </button>
                      )}
                      {canResume && (
                        <button
                          type="button"
                          onClick={() => onResume(job.job_id)}
                          className="rounded p-1 text-emerald-400 hover:bg-[#21262d]"
                          title={t("sftp.queue_resume")}
                        >
                          <Play className="h-3 w-3" />
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => onCancel(job.job_id)}
                          className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-red-400"
                          title={t("sftp.queue_cancel")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
