import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton, Switch } from "@/shared/ui";
import { hostsApi } from "../api/hostsApi";
import type { PortProbeResultDto } from "../types";
import type { DraftPortForward } from "./hostFormTypes";

interface HostPortForwardSectionProps {
  forwards: DraftPortForward[];
  onToggleRule: (idx: number) => void;
  onRequestDeleteRule: (idx: number) => void;
  onOpenAddRule: () => void;
  onOpenEditRule: (idx: number) => void;
}

const normalizeAddr = (addr: string) => {
  const t = addr.trim().toLowerCase();
  return !t || t === "localhost" ? "127.0.0.1" : t;
};

export const HostPortForwardSection: React.FC<HostPortForwardSectionProps> = ({
  forwards,
  onToggleRule,
  onRequestDeleteRule,
  onOpenAddRule,
  onOpenEditRule,
}) => {
  const { t } = useI18n();

  const [probedStatuses, setProbedStatuses] = useState<Record<number, PortProbeResultDto>>({});
  const [isProbingAll, setIsProbingAll] = useState(false);

  const listConflictMap = useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < forwards.length; i++) {
      const a = forwards[i];
      if (!a.is_enabled) continue;
      const aIsLocal = a.forward_type === "LOCAL" || a.forward_type === "DYNAMIC";
      const aNorm = normalizeAddr(a.bind_address);

      for (let j = i + 1; j < forwards.length; j++) {
        const b = forwards[j];
        if (!b.is_enabled) continue;
        const bIsLocal = b.forward_type === "LOCAL" || b.forward_type === "DYNAMIC";
        const bNorm = normalizeAddr(b.bind_address);

        if (aIsLocal && bIsLocal && a.bind_port === b.bind_port) {
          if (aNorm === bNorm || aNorm === "0.0.0.0" || bNorm === "0.0.0.0") {
            map.set(i, b.label);
            map.set(j, a.label);
          }
        } else if (
          a.forward_type === "REMOTE" &&
          b.forward_type === "REMOTE" &&
          a.bind_port === b.bind_port
        ) {
          if (aNorm === bNorm || aNorm === "0.0.0.0" || bNorm === "0.0.0.0") {
            map.set(i, b.label);
            map.set(j, a.label);
          }
        }
      }
    }
    return map;
  }, [forwards]);

  const handleProbeAll = useCallback(async () => {
    setIsProbingAll(true);
    try {
      const probeMap: Record<number, PortProbeResultDto> = {};
      for (let i = 0; i < forwards.length; i++) {
        const r = forwards[i];
        if (r.forward_type === "REMOTE") continue;
        const res = await hostsApi
          .portCheckAvailable(r.bind_address, r.bind_port)
          .catch(() => null);
        if (res) probeMap[i] = res;
      }
      setProbedStatuses(probeMap);
    } finally {
      setIsProbingAll(false);
    }
  }, [forwards]);

  return (
    <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
          <Network className="w-4 h-4 text-emerald-400" />
          <span>{t("forward.title")}</span>
        </div>

        <div className="flex items-center gap-2">
          {forwards.length > 0 && (
            <button
              type="button"
              onClick={handleProbeAll}
              disabled={isProbingAll}
              className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors px-2 py-1 rounded hover:bg-slate-800/60 disabled:opacity-50"
              title={t("forward.check_all")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbingAll ? "animate-spin" : ""}`} />
              <span>{t("forward.check_all")}</span>
            </button>
          )}

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onOpenAddRule}
            leftIcon={<Plus className="w-3.5 h-3.5 text-emerald-400" />}
            className="text-emerald-400 hover:text-emerald-300 border-slate-700/80"
          >
            {t("forward.add")}
          </Button>
        </div>
      </div>

      {forwards.length === 0 ? (
        <div className="py-5 px-3 rounded-lg border border-dashed border-slate-800 flex flex-col items-center justify-center text-center text-slate-500 space-y-2 bg-slate-900/30">
          <Network className="w-7 h-7 text-slate-600 stroke-[1.5]" />
          <p className="text-xs text-slate-400">{t("forward.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {forwards.map((pf, idx) => {
            const conflictWith = listConflictMap.get(idx);
            const probeInfo = probedStatuses[idx];

            return (
              <div
                key={pf.id ?? idx}
                className={`p-2.5 rounded-lg border transition-all ${
                  conflictWith
                    ? "bg-rose-950/20 border-rose-800/60"
                    : "bg-slate-900/90 border-slate-800 hover:border-slate-700"
                } flex flex-col gap-1.5`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Switch
                      size="sm"
                      checked={pf.is_enabled}
                      onChange={() => onToggleRule(idx)}
                      aria-label={t("forward.enabled")}
                    />

                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border shrink-0 ${
                        pf.forward_type === "LOCAL"
                          ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/60"
                          : pf.forward_type === "REMOTE"
                          ? "bg-purple-950/80 text-purple-400 border-purple-800/60"
                          : "bg-amber-950/80 text-amber-400 border-amber-800/60"
                      }`}
                    >
                      {pf.forward_type}
                    </span>

                    <div className="flex items-center gap-2 truncate text-xs">
                      <span className="font-medium text-slate-200 truncate">{pf.label}</span>
                      <span className="text-slate-400 font-mono text-[11px] truncate">
                        {pf.bind_address}:{pf.bind_port}
                        {pf.forward_type !== "DYNAMIC"
                          ? ` → ${pf.target_host}:${pf.target_port}`
                          : " (SOCKS5)"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {probeInfo && pf.forward_type !== "REMOTE" && (
                      <span
                        className="flex items-center gap-1 text-[11px] mr-1.5"
                        title={
                          probeInfo.status === "AVAILABLE"
                            ? t("forward.port_available", { port: pf.bind_port })
                            : probeInfo.status === "SHARED_WITH_ACTIVE_TAB"
                            ? t("forward.port_active_tab", { port: pf.bind_port })
                            : probeInfo.conflicting_process_name
                            ? t("forward.port_occupied", {
                                port: pf.bind_port,
                                process: probeInfo.conflicting_process_name,
                                pid: probeInfo.conflicting_pid ?? "",
                              })
                            : t("forward.port_occupied_unknown", { port: pf.bind_port })
                        }
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            probeInfo.status === "AVAILABLE"
                              ? "bg-emerald-400 animate-pulse"
                              : probeInfo.status === "SHARED_WITH_ACTIVE_TAB"
                              ? "bg-sky-400"
                              : "bg-rose-400"
                          }`}
                        />
                      </span>
                    )}

                    <IconButton
                      size="sm"
                      title={t("forward.edit")}
                      onClick={() => onOpenEditRule(idx)}
                      icon={<Pencil className="w-3.5 h-3.5" />}
                    />

                    <IconButton
                      size="sm"
                      tone="rose"
                      title={t("common.delete")}
                      onClick={() => onRequestDeleteRule(idx)}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    />
                  </div>
                </div>

                {conflictWith && pf.is_enabled && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-400 pl-8">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t("forward.duplicate_port_warning", {
                        port: pf.bind_port,
                        name: conflictWith,
                      })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
