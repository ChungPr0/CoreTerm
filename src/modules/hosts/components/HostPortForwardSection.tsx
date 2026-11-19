import React, { useRef, useState } from "react";
import { Network, Plus, Trash2 } from "lucide-react";
import type { ForwardType } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton, Input, Select, Switch, useAlert } from "@/shared/ui";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";
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

  const bindPortInputRef = useRef<HTMLInputElement>(null);
  const targetHostInputRef = useRef<HTMLInputElement>(null);
  const targetPortInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const bindPortNum = Number(newPfBindPort);
    if (!Number.isInteger(bindPortNum) || bindPortNum < 1 || bindPortNum > 65535) {
      scrollAndFocusInput(bindPortInputRef.current);
      alert.error(t("errors.forward_port_range"));
      return;
    }
    const targetHost = newPfTargetHost.trim();
    const targetPortNum = Number(newPfTargetPort);
    if (newPfType !== "DYNAMIC") {
      if (!targetHost) {
        scrollAndFocusInput(targetHostInputRef.current);
        alert.error(t("errors.forward_target_required"));
        return;
      }
      if (!Number.isInteger(targetPortNum) || targetPortNum < 1 || targetPortNum > 65535) {
        scrollAndFocusInput(targetPortInputRef.current);
        alert.error(t("errors.forward_target_required"));
        return;
      }
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
            <Input
              type="text"
              label={<span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{t("forward.label")}</span>}
              value={newPfLabel}
              onChange={(e) => setNewPfLabel(e.target.value)}
            />
          </div>

          <div className="col-span-4">
            <Select
              label={<span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{t("forward.type")}</span>}
              value={newPfType}
              onChange={(e) => setNewPfType(e.target.value as ForwardType)}
            >
              <option value="LOCAL">{t("forward.local")}</option>
              <option value="REMOTE">{t("forward.remote")}</option>
              <option value="DYNAMIC">{t("forward.dynamic")}</option>
            </Select>
          </div>

          <div className="col-span-3">
            <Input
              type="text"
              label={<span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{t("forward.bind_addr")}</span>}
              value={newPfBindAddr}
              onChange={(e) => setNewPfBindAddr(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2.5 items-end">
          <div className={newPfType === "DYNAMIC" ? "col-span-3" : "col-span-2"}>
            <Input
              ref={bindPortInputRef}
              type="number"
              label={<span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{t("forward.bind_port")}</span>}
              value={newPfBindPort}
              onChange={(e) => setNewPfBindPort(Number(e.target.value))}
              className="font-mono"
            />
          </div>

          {newPfType !== "DYNAMIC" && (
            <>
              <div className="col-span-5">
                <Input
                  ref={targetHostInputRef}
                  type="text"
                  label={<span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{t("forward.target_host")}</span>}
                  value={newPfTargetHost}
                  onChange={(e) => setNewPfTargetHost(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="col-span-2">
                <Input
                  ref={targetPortInputRef}
                  type="number"
                  label={<span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{t("forward.target_port")}</span>}
                  value={newPfTargetPort}
                  onChange={(e) => setNewPfTargetPort(Number(e.target.value))}
                  className="font-mono"
                />
              </div>
            </>
          )}

          <div
            className={
              newPfType === "DYNAMIC" ? "col-span-3 col-start-10" : "col-span-3"
            }
          >
            <Button
              variant="success"
              type="button"
              onClick={handleAdd}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              className="w-full"
            >
              {t("forward.add")}
            </Button>
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
                <Switch
                  size="sm"
                  checked={pf.is_enabled}
                  onChange={() => onToggleRule(idx)}
                  aria-label={t("forward.enabled")}
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

              <IconButton
                size="sm"
                tone="rose"
                title={t("common.delete")}
                onClick={() => onRequestDeleteRule(idx)}
                icon={<Trash2 className="w-3.5 h-3.5" />}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
