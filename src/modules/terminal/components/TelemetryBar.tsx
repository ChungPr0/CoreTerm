import React from "react";
import { Cpu, HardDrive } from "lucide-react";
import type { SessionState } from "@/shared/types/ipc";
import type { TelemetryMetricsEventDto } from "../types";
import { useI18n } from "@/shared/i18n";

interface TelemetryBarProps {
  metrics?: TelemetryMetricsEventDto;
  sessionState: SessionState;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function getLoadColor(percent: number): {
  bar: string;
  text: string;
} {
  if (percent > 90) {
    return { bar: "bg-rose-500", text: "text-rose-400" };
  }
  if (percent >= 75) {
    return { bar: "bg-amber-400", text: "text-amber-300" };
  }
  return { bar: "bg-emerald-500", text: "text-emerald-400" };
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  metrics,
  sessionState,
  onContextMenu,
}) => {
  const { t } = useI18n();

  const isDimmed = !metrics || metrics.is_stale || sessionState !== "ONLINE";
  const cpuPercent = metrics
    ? Math.round(Math.min(Math.max(metrics.cpu_usage_percent, 0), 100))
    : 0;
  const ramPercent = metrics
    ? Math.round(Math.min(Math.max(metrics.ram_usage_percent, 0), 100))
    : 0;

  const cpuTheme = getLoadColor(cpuPercent);
  const ramTheme = getLoadColor(ramPercent);

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e);
      }}
      className={`inline-flex items-center gap-3 px-3 py-1.5 leading-none rounded-lg bg-slate-900/95 border border-slate-800 hover:border-slate-700 shadow-lg font-mono text-[11px] select-none cursor-default transition-[opacity,border-color] ${
        isDimmed ? "opacity-55" : "opacity-100"
      }`}
    >
      {/* CPU block */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-slate-400 shrink-0">{t("telemetry.cpu")}</span>
        <div className="w-11 h-1.5 rounded-full bg-slate-800 overflow-hidden shrink-0">
          <div
            className={`h-full transition-all duration-300 ${cpuTheme.bar}`}
            style={{ width: `${cpuPercent}%` }}
          />
        </div>
        <span
          className={`w-[34px] text-right tabular-nums font-semibold shrink-0 ${cpuTheme.text}`}
        >
          {cpuPercent}%
        </span>
      </div>

      <div className="w-px h-3.5 bg-slate-800 shrink-0" />

      {/* RAM block */}
      <div className="flex items-center gap-1.5 shrink-0">
        <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-slate-400 shrink-0">{t("telemetry.ram")}</span>
        <div className="w-11 h-1.5 rounded-full bg-slate-800 overflow-hidden shrink-0">
          <div
            className={`h-full transition-all duration-300 ${ramTheme.bar}`}
            style={{ width: `${ramPercent}%` }}
          />
        </div>
        <span
          className={`w-[34px] text-right tabular-nums font-semibold shrink-0 ${ramTheme.text}`}
        >
          {ramPercent}%
        </span>
      </div>
    </div>
  );
};
