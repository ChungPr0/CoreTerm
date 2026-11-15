import React, { useState } from "react";
import { Network, Plus, Trash2 } from "lucide-react";
import type { ForwardType } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { useAlert } from "@/shared/ui";
import type { DraftPortForward } from "./hostFormTypes";

interface HostPortForwardSectionProps {
  forwards: DraftPortForward[];
  onAddRule: (rule: DraftPortForward) => void;
  onToggleRule: (idx: number) => void;
  onRequestDeleteRule: (idx: number) => void;
}

export const HostPortForwardSection: React.FC<HostPortForwardSectionProps> = ({
  forwards,
  onAddRule,
  onToggleRule,
  onRequestDeleteRule,
}) => {
  const { t } = useI18n();
  const alert = useAlert();

  const [newPfLabel, setNewPfLabel] = useState("");
  const [newPfType, setNewPfType] = useState<ForwardType>("LOCAL");
  const [newPfBindAddr, setNewPfBindAddr] = useState("127.0.0.1");
  const [newPfBindPort, setNewPfBindPort] = useState<number>(8080);
  const [newPfTargetHost, setNewPfTargetHost] = useState("localhost");
  const [newPfTargetPort, setNewPfTargetPort] = useState<number>(80);

  const handleAdd = () => {
    const bindPortNum = Number(newPfBindPort);
    if (!Number.isInteger(bindPortNum) || bindPortNum < 1 || bindPortNum > 65535) {
      alert.error(t("errors.forward_port_range"));
      return;
    }
    const targetHost = newPfTargetHost.trim();
    const targetPortNum = Number(newPfTargetPort);
    if (
      newPfType !== "DYNAMIC" &&
      (!targetHost ||
        !Number.isInteger(targetPortNum) ||
        targetPortNum < 1 ||
        targetPortNum > 65535)
    ) {
      alert.error(t("errors.forward_target_required"));
      return;
    }

    onAddRule({
      label: newPfLabel.trim() || `${newPfType} ${bindPortNum}`,
      forward_type: newPfType,
      bind_address: newPfBindAddr.trim() || "127.0.0.1",
      bind_port: bindPortNum,
      target_host: targetHost || "localhost",
      target_port: targetPortNum || 80,
      is_enabled: true,
    });
    setNewPfLabel("");
  };

  return (
    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2.5">
      <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
        <Network className="w-4 h-4 text-emerald-400" />
        <span>{t("forward.title")}</span>
      </div>

      <div className="space-y-2.5">
        <div className="grid grid-cols-12 gap-2.5 items-end">
          <div className="col-span-5">
            <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
              {t("forward.label")}
            </label>
            <input
              type="text"
              value={newPfLabel}
              onChange={(e) => setNewPfLabel(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100"
            />
          </div>

          <div className="col-span-4">
            <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
              {t("forward.type")}
            </label>
            <select
              value={newPfType}
              onChange={(e) => setNewPfType(e.target.value as ForwardType)}
              className="w-full h-8 px-2 rounded-md bg-slate-900 border border-slate-800 text-slate-100"
            >
              <option value="LOCAL">{t("forward.local")}</option>
              <option value="REMOTE">{t("forward.remote")}</option>
              <option value="DYNAMIC">{t("forward.dynamic")}</option>
            </select>
          </div>

          <div className="col-span-3">
            <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
              {t("forward.bind_addr")}
            </label>
            <input
              type="text"
              value={newPfBindAddr}
              onChange={(e) => setNewPfBindAddr(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2.5 items-end">
          <div className={newPfType === "DYNAMIC" ? "col-span-3" : "col-span-2"}>
            <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
              {t("forward.bind_port")}
            </label>
            <input
              type="number"
              value={newPfBindPort}
              onChange={(e) => setNewPfBindPort(Number(e.target.value))}
              className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
            />
          </div>

          {newPfType !== "DYNAMIC" && (
            <>
              <div className="col-span-5">
                <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                  {t("forward.target_host")}
                </label>
                <input
                  type="text"
                  value={newPfTargetHost}
                  onChange={(e) => setNewPfTargetHost(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-medium text-slate-400 mb-1 whitespace-nowrap">
                  {t("forward.target_port")}
                </label>
                <input
                  type="number"
                  value={newPfTargetPort}
                  onChange={(e) => setNewPfTargetPort(Number(e.target.value))}
                  className="w-full h-8 px-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>
            </>
          )}

          <div
            className={
              newPfType === "DYNAMIC" ? "col-span-3 col-start-10" : "col-span-3"
            }
          >
            <button
              type="button"
              onClick={handleAdd}
              className="w-full h-8 flex items-center justify-center gap-1.5 px-3 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>{t("forward.add")}</span>
            </button>
          </div>
        </div>
      </div>

      {forwards.length > 0 && (
        <div className="space-y-1 pt-1">
          {forwards.map((pf, idx) => (
            <div
              key={pf.id ?? idx}
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between"
            >
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <input
                  type="checkbox"
                  checked={pf.is_enabled}
                  onChange={() => onToggleRule(idx)}
                  title={t("forward.enabled")}
                />
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px]">
                  {pf.forward_type}
                </span>
                <span className="text-slate-200 font-sans font-medium">
                  {pf.label}
                </span>
                <span className="text-slate-400">
                  {pf.bind_address}:{pf.bind_port}
                  {pf.forward_type !== "DYNAMIC"
                    ? ` → ${pf.target_host}:${pf.target_port}`
                    : ""}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onRequestDeleteRule(idx)}
                title={t("common.delete")}
                className="p-1 text-slate-400 hover:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
