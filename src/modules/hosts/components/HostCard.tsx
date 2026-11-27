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
import { IconButton } from "@/shared/ui";

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
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, host, groupName)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onConnect(host);
        }
      }}
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
      className={`group p-2 rounded-md border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:border-sky-500/60 ${
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
          <IconButton
            size="sm"
            bordered
            tone="emerald"
            title={t("common.connect")}
            onClick={(e) => {
              e.stopPropagation();
              onConnect(host);
            }}
            icon={<Play className="w-3 h-3" />}
          />
          {onOpenSftp && (
            <IconButton
              size="sm"
              bordered
              tone="sky"
              title={t("sftp.open_sftp_tab")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSftp(host);
              }}
              icon={<FolderSync className="w-3 h-3" />}
            />
          )}
          <IconButton
            size="sm"
            bordered
            tone="default"
            title={t("common.duplicate")}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(host);
            }}
            icon={<Copy className="w-3 h-3" />}
          />
          <IconButton
            size="sm"
            bordered
            tone="sky"
            title={t("common.edit")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(host.id);
            }}
            icon={<Edit2 className="w-3 h-3" />}
          />
          <IconButton
            size="sm"
            bordered
            tone="rose"
            title={t("common.delete")}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(host);
            }}
            icon={<Trash2 className="w-3 h-3" />}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span className="truncate">
          {host.username}@{host.host}:{host.port}
        </span>
        {host.active_port_forwards_count > 0 && (
          <span className="text-[9px] px-1 rounded bg-sky-500/15 text-sky-300 shrink-0">
            {t("forward.badge_count", { count: host.active_port_forwards_count })}
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
