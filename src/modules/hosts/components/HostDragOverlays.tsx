import React from "react";
import { ArrowRight, Folder, KeyRound, Lock } from "lucide-react";
import type { HostDragPreview } from "../hooks/useHostDrag";
import type { GroupDragPreview } from "../hooks/useGroupDrag";

const DRAG_PREVIEW_PILL_CLASS =
  "fixed z-[120] pointer-events-none flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-sky-500/60 shadow-[0_12px_30px_rgba(0,0,0,0.75)] text-xs select-none";

interface HostDragOverlaysProps {
  dragPreview: HostDragPreview | null;
  groupDragPreview: GroupDragPreview | null;
}

export const HostDragOverlays: React.FC<HostDragOverlaysProps> = ({
  dragPreview,
  groupDragPreview,
}) => (
  <>
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
