import React from "react";
import { AlertCircle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import type { ForwardType } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import type { PortProbeResultDto } from "../types";

interface PortForwardStatusBadgeProps {
  forwardType: ForwardType;
  portLocal: string;
  portProbe: PortProbeResultDto | null;
  isPrivilegedLocal: boolean;
  isCheckingPort: boolean;
}

export const PortForwardStatusBadge: React.FC<PortForwardStatusBadgeProps> = ({
  forwardType,
  portLocal,
  portProbe,
  isPrivilegedLocal,
  isCheckingPort,
}) => {
  const { t } = useI18n();

  if (forwardType === "REMOTE") return null;

  if (portProbe?.status === "CONFLICT_EXTERNAL") {
    const tooltipText = portProbe.conflicting_process_name
      ? `${portProbe.conflicting_process_name}${
          portProbe.conflicting_pid != null ? ` (PID: ${portProbe.conflicting_pid})` : ""
        }`
      : t("forward.port_occupied_unknown", { port: portLocal });

    return (
      <span
        className="text-[11px] text-amber-400 font-medium flex items-center gap-1 font-sans whitespace-nowrap shrink-0"
        title={tooltipText}
      >
        <AlertCircle className="w-3 h-3 shrink-0" />
        <span>{t("forward.port_busy")}</span>
      </span>
    );
  }

  if (portProbe?.status === "SHARED_WITH_ACTIVE_TAB") {
    return (
      <span
        className="text-[11px] text-sky-400 font-medium flex items-center gap-1 font-sans whitespace-nowrap shrink-0"
        title={t("forward.port_active_tab", { port: portLocal })}
      >
        <Info className="w-3 h-3 shrink-0" />
        <span>{t("forward.port_in_use_tab")}</span>
      </span>
    );
  }

  if (isPrivilegedLocal) {
    return (
      <span
        className="text-[11px] text-amber-400 font-medium flex items-center gap-1 font-sans whitespace-nowrap shrink-0"
        title={t("forward.port_privileged")}
      >
        <AlertCircle className="w-3 h-3 shrink-0" />
        <span>{t("forward.port_warning")}</span>
      </span>
    );
  }

  if (isCheckingPort) {
    return (
      <span className="text-[11px] text-slate-400 font-normal flex items-center gap-1 font-sans whitespace-nowrap shrink-0">
        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
        <span>{t("forward.checking")}</span>
      </span>
    );
  }

  if (portProbe?.status === "AVAILABLE") {
    return (
      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 font-sans whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3 h-3 shrink-0" />
        <span>{t("forward.port_ready")}</span>
      </span>
    );
  }

  return null;
};
