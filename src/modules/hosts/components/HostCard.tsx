import React from "react";
import {
  Copy,
  Edit2,
  FolderSync,
  KeyRound,
  Lock,
  Play,
  Trash2,
} from "lucide-react";
import type { HostProfileSummaryDto } from "../types";
import { useI18n } from "@/shared/i18n";

interface HostCardProps {
  host: HostProfileSummaryDto;
  groupName: string;
  isDragging: boolean;
  onPointerDown: (
    e: React.PointerEvent<HTMLDivElement>,
    host: HostProfileSummaryDto,
    groupName: string
  ) => void;
  onConnect: (host: HostProfileSummaryDto) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
  onDuplicate: (host: HostProfileSummaryDto) => void;
  onEdit: (hostId: string) => void;
  onDelete: (host: HostProfileSummaryDto) => void;
  onContextMenu?: (e: React.MouseEvent, host: HostProfileSummaryDto) => void;
  shouldSuppressDblClick: () => boolean;
}

const ACTION_BTN_CLASS =
  "inline-flex h-[22px] w-[22px] items-center justify-center rounded border border-slate-800/80 bg-slate-900/70 text-slate-400 transition-colors";

export const HostCard: React.FC<HostCardProps> = ({
  host,
  groupName,
  isDragging,
  onPointerDown,
  onConnect,
  onOpenSftp,
  onDuplicate,
  onEdit,
  onDelete,
  onContextMenu,
  shouldSuppressDblClick,
}) => {
  const { t } = useI18n();

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, host, groupName)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button") || shouldSuppressDblClick()) return;
        onConnect(host);
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, host);
      }}
      className={`group p-2 rounded-md border transition-all cursor-pointer ${
        isDragging
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

        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 shrink-0 opacity-85 group-hover:opacity-100"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConnect(host);
            }}
            title={t("common.connect")}
            className={`${ACTION_BTN_CLASS} hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-400`}
          >
            <Play className="w-3 h-3" />
          </button>
          {onOpenSftp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSftp(host);
              }}
              title={t("sftp.open_sftp_tab")}
              className={`${ACTION_BTN_CLASS} hover:border-sky-500/40 hover:bg-sky-500/15 hover:text-sky-400`}
            >
              <FolderSync className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(host);
            }}
            title={t("common.duplicate")}
            className={`${ACTION_BTN_CLASS} hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200`}
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(host.id);
            }}
            title={t("common.edit")}
            className={`${ACTION_BTN_CLASS} hover:border-sky-500/40 hover:bg-sky-500/15 hover:text-sky-400`}
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(host);
            }}
            title={t("common.delete")}
            className={`${ACTION_BTN_CLASS} hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-400`}
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
              className="px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800 text-[9px]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
