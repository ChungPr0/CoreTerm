import React from "react";
import { ArrowRight } from "lucide-react";
import type { ForwardType } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";

interface PortForwardFlowPreviewProps {
  forwardType: ForwardType;
  ipLocal: string;
  portLocal: string;
  ipRemote: string;
  portRemote: string;
}

export const PortForwardFlowPreview: React.FC<PortForwardFlowPreviewProps> = ({
  forwardType,
  ipLocal,
  portLocal,
  ipRemote,
  portRemote,
}) => {
  const { t } = useI18n();

  return (
    <div className="px-3 py-2 rounded bg-slate-950/80 border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-300 overflow-x-auto">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-medium">
          {t("forward.flow_preview")}:
        </span>
        {forwardType === "LOCAL" && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span>
              Local {ipLocal.trim() || "127.0.0.1"}:{portLocal || "?"}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <span>
              Remote {ipRemote.trim() || "localhost"}:{portRemote || "?"}
            </span>
          </span>
        )}
        {forwardType === "REMOTE" && (
          <span className="flex items-center gap-1.5 text-purple-400">
            <span>
              Remote {ipRemote.trim() || "127.0.0.1"}:{portRemote || "?"}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <span>
              Local {ipLocal.trim() || "localhost"}:{portLocal || "?"}
            </span>
          </span>
        )}
        {forwardType === "DYNAMIC" && (
          <span className="flex items-center gap-1.5 text-amber-400">
            <span>
              Local {ipLocal.trim() || "127.0.0.1"}:{portLocal || "?"} (SOCKS5)
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
