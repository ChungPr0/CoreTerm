import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Info,
  Network,
  RefreshCw,
  X,
} from "lucide-react";
import type { ForwardType } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { Button, Input, ModalShell, Select, useAlert } from "@/shared/ui";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";
import { hostsApi } from "../api/hostsApi";
import type { PortProbeResultDto } from "../types";
import type { DraftPortForward } from "./hostFormTypes";

interface PortForwardModalProps {
  isOpen: boolean;
  initialRule: DraftPortForward | null;
  existingRules: DraftPortForward[];
  editingIndex: number | null;
  onClose: () => void;
  onSave: (rule: DraftPortForward) => void;
}

const normalizeAddr = (addr: string) => {
  const t = addr.trim().toLowerCase();
  return !t || t === "localhost" ? "127.0.0.1" : t;
};

export const PortForwardModal: React.FC<PortForwardModalProps> = ({
  isOpen,
  initialRule,
  existingRules,
  editingIndex,
  onClose,
  onSave,
}) => {
  const { t } = useI18n();
  const alert = useAlert();

  const [label, setLabel] = useState("");
  const [forwardType, setForwardType] = useState<ForwardType>("LOCAL");

  const [ipLocal, setIpLocal] = useState("127.0.0.1");
  const [portLocal, setPortLocal] = useState("8080");
  const [ipRemote, setIpRemote] = useState("localhost");
  const [portRemote, setPortRemote] = useState("80");

  const [portProbe, setPortProbe] = useState<PortProbeResultDto | null>(null);
  const [isCheckingPort, setIsCheckingPort] = useState(false);

  const isPrivilegedLocal = useMemo(() => {
    const p = Number(portLocal);
    return Number.isInteger(p) && p > 0 && p < 1024;
  }, [portLocal]);

  const isPrivilegedRemote = useMemo(() => {
    const p = Number(portRemote);
    return Number.isInteger(p) && p > 0 && p < 1024;
  }, [portRemote]);

  const portLocalInputRef = useRef<HTMLInputElement>(null);
  const ipRemoteInputRef = useRef<HTMLInputElement>(null);
  const portRemoteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialRule) {
      setLabel(initialRule.label);
      setForwardType(initialRule.forward_type);

      if (initialRule.forward_type === "REMOTE") {
        setIpRemote(initialRule.bind_address || "127.0.0.1");
        setPortRemote(String(initialRule.bind_port || 3000));
        setIpLocal(initialRule.target_host || "localhost");
        setPortLocal(String(initialRule.target_port || 3000));
      } else {
        setIpLocal(initialRule.bind_address || "127.0.0.1");
        setPortLocal(String(initialRule.bind_port || 8080));
        setIpRemote(initialRule.target_host || "localhost");
        setPortRemote(String(initialRule.target_port || 80));
      }
    } else {
      setLabel("");
      setForwardType("LOCAL");
      setIpLocal("127.0.0.1");
      setPortLocal("8080");
      setIpRemote("localhost");
      setPortRemote("80");
    }
    setPortProbe(null);
  }, [isOpen, initialRule]);

  useEffect(() => {
    if (!isOpen || forwardType === "REMOTE") {
      setPortProbe(null);
      setIsCheckingPort(false);
      return;
    }
    const portNum = Number(portLocal);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setPortProbe(null);
      setIsCheckingPort(false);
      return;
    }

    const cleanIp = ipLocal.trim();
    if (
      cleanIp.startsWith("-") ||
      /\s/.test(cleanIp) ||
      /[;`&$|]/.test(cleanIp)
    ) {
      setPortProbe(null);
      setIsCheckingPort(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(() => {
      setIsCheckingPort(true);
      hostsApi
        .portCheckAvailable(ipLocal.trim() || "127.0.0.1", portNum)
        .then((res) => {
          if (!cancelled) setPortProbe(res);
        })
        .catch(() => {
          if (!cancelled) setPortProbe(null);
        })
        .finally(() => {
          if (!cancelled) setIsCheckingPort(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setIsCheckingPort(false);
    };
  }, [isOpen, portLocal, ipLocal, forwardType]);

  const duplicateInfo = useMemo(() => {
    const listenPortNum = forwardType === "REMOTE" ? Number(portRemote) : Number(portLocal);
    const listenAddr = forwardType === "REMOTE" ? ipRemote : ipLocal;

    if (!Number.isInteger(listenPortNum) || listenPortNum < 1 || listenPortNum > 65535) {
      return { isDuplicate: false };
    }

    const curNormAddr = normalizeAddr(listenAddr);
    const curIsLocal = forwardType === "LOCAL" || forwardType === "DYNAMIC";

    for (let i = 0; i < existingRules.length; i++) {
      if (i === editingIndex) continue;
      const other = existingRules[i];
      if (!other.is_enabled) continue;

      const otherIsLocal = other.forward_type === "LOCAL" || other.forward_type === "DYNAMIC";

      if (curIsLocal && otherIsLocal && other.bind_port === listenPortNum) {
        const otherNorm = normalizeAddr(other.bind_address);
        if (curNormAddr === otherNorm || curNormAddr === "0.0.0.0" || otherNorm === "0.0.0.0") {
          return { isDuplicate: true, conflictingName: other.label };
        }
      } else if (
        forwardType === "REMOTE" &&
        other.forward_type === "REMOTE" &&
        other.bind_port === listenPortNum
      ) {
        const otherNorm = normalizeAddr(other.bind_address);
        if (curNormAddr === otherNorm || curNormAddr === "0.0.0.0" || otherNorm === "0.0.0.0") {
          return { isDuplicate: true, conflictingName: other.label };
        }
      }
    }
    return { isDuplicate: false };
  }, [forwardType, portLocal, ipLocal, portRemote, ipRemote, existingRules, editingIndex]);

  const handleSaveRule = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const portLocalNum = Number(portLocal);
    if (!Number.isInteger(portLocalNum) || portLocalNum < 1 || portLocalNum > 65535) {
      scrollAndFocusInput(portLocalInputRef.current);
      alert.error(t("errors.forward_port_range"));
      return;
    }

    const cleanIpLocal = ipLocal.trim() || "127.0.0.1";
    if (cleanIpLocal.startsWith("-") || /\s/.test(cleanIpLocal) || /[;`&$|]/.test(cleanIpLocal)) {
      alert.error(t("errors.forward_bind_address_invalid"));
      return;
    }

    const cleanIpRemote = ipRemote.trim() || "localhost";
    const portRemoteNum = Number(portRemote);

    if (forwardType !== "DYNAMIC") {
      if (!cleanIpRemote) {
        scrollAndFocusInput(ipRemoteInputRef.current);
        alert.error(t("errors.forward_target_required"));
        return;
      }
      if (
        cleanIpRemote.startsWith("-") ||
        /\s/.test(cleanIpRemote) ||
        /[;`&$|]/.test(cleanIpRemote)
      ) {
        scrollAndFocusInput(ipRemoteInputRef.current);
        alert.error(t("errors.forward_target_host_invalid"));
        return;
      }
      if (!Number.isInteger(portRemoteNum) || portRemoteNum < 1 || portRemoteNum > 65535) {
        scrollAndFocusInput(portRemoteInputRef.current);
        alert.error(t("errors.forward_port_range"));
        return;
      }
    }

    const listenPort = forwardType === "REMOTE" ? portRemoteNum : portLocalNum;
    if (duplicateInfo.isDuplicate) {
      scrollAndFocusInput(forwardType === "REMOTE" ? portRemoteInputRef.current : portLocalInputRef.current);
      alert.error(
        t("forward.duplicate_port_warning", {
          port: listenPort,
          name: duplicateInfo.conflictingName ?? "",
        })
      );
      return;
    }

    const fallbackLabel =
      forwardType === "DYNAMIC"
        ? `Dynamic :${portLocalNum}`
        : `${forwardType === "LOCAL" ? "Local" : "Remote"} :${portLocalNum} → :${portRemoteNum}`;

    let ruleData: DraftPortForward;
    if (forwardType === "REMOTE") {
      ruleData = {
        id: initialRule?.id,
        label: label.trim() || fallbackLabel,
        forward_type: "REMOTE",
        bind_address: cleanIpRemote,
        bind_port: portRemoteNum,
        target_host: cleanIpLocal,
        target_port: portLocalNum,
        is_enabled: initialRule?.is_enabled ?? true,
      };
    } else if (forwardType === "DYNAMIC") {
      ruleData = {
        id: initialRule?.id,
        label: label.trim() || fallbackLabel,
        forward_type: "DYNAMIC",
        bind_address: cleanIpLocal,
        bind_port: portLocalNum,
        target_host: "localhost",
        target_port: 80,
        is_enabled: initialRule?.is_enabled ?? true,
      };
    } else {
      ruleData = {
        id: initialRule?.id,
        label: label.trim() || fallbackLabel,
        forward_type: "LOCAL",
        bind_address: cleanIpLocal,
        bind_port: portLocalNum,
        target_host: cleanIpRemote,
        target_port: portRemoteNum,
        is_enabled: initialRule?.is_enabled ?? true,
      };
    }

    onSave(ruleData);
    onClose();
  };

  const renderLocalStatusBadge = () => {
    if (forwardType === "REMOTE") return null;

    if (portProbe?.status === "CONFLICT_EXTERNAL") {
      const tooltipText = portProbe.conflicting_process_name
        ? `${portProbe.conflicting_process_name}${
            portProbe.conflicting_pid != null ? ` (PID: ${portProbe.conflicting_pid})` : ""
          }`
        : t("forward.port_occupied_unknown", { port: portLocal });

      return (
        <span
          className="text-[11px] text-amber-400 font-medium flex items-center gap-1 font-sans"
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
          className="text-[11px] text-sky-400 font-medium flex items-center gap-1 font-sans"
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
          className="text-[11px] text-amber-400 font-medium flex items-center gap-1 font-sans"
          title={t("forward.port_privileged")}
        >
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{t("forward.port_warning")}</span>
        </span>
      );
    }

    if (isCheckingPort) {
      return (
        <span className="text-[11px] text-slate-400 font-normal flex items-center gap-1 font-sans">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>{t("forward.checking")}</span>
        </span>
      );
    }

    if (portProbe?.status === "AVAILABLE") {
      return (
        <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 font-sans">
          <CheckCircle2 className="w-3 h-3" />
          <span>{t("forward.port_ready")}</span>
        </span>
      );
    }

    return null;
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      zIndexClass="z-[60]"
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col select-none"
    >
      <div
        data-tauri-drag-region="deep"
        className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0"
      >
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-100">
            {initialRule ? t("forward.edit_title") : t("forward.add_title")}
          </h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} type="button">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-5 space-y-4 text-xs">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7">
            <Input
              type="text"
              label={
                <span className="text-[11px] font-medium text-slate-300">
                  {t("forward.label")}
                </span>
              }
              placeholder={t("forward.label_placeholder")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="col-span-5">
            <Select
              label={
                <span className="text-[11px] font-medium text-slate-300">
                  {t("forward.type")}
                </span>
              }
              value={forwardType}
              onChange={(e) => setForwardType(e.target.value as ForwardType)}
            >
              <option value="LOCAL">{t("forward.local")}</option>
              <option value="REMOTE">{t("forward.remote")}</option>
              <option value="DYNAMIC">{t("forward.dynamic")}</option>
            </Select>
          </div>
        </div>

        {forwardType === "DYNAMIC" ? (
          <div className="space-y-3">
            <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/60 space-y-3">
              <div className="flex items-center justify-between pb-0.5">
                <div className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>LOCAL (SOCKS5)</span>
                </div>
                {renderLocalStatusBadge()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="text"
                  label={
                    <span className="text-[11px] font-medium text-slate-300">
                      {t("forward.ip_local")}
                    </span>
                  }
                  value={ipLocal}
                  onChange={(e) => setIpLocal(e.target.value)}
                  className="font-mono text-xs"
                />

                <Input
                  ref={portLocalInputRef}
                  type="number"
                  min={1}
                  max={65535}
                  label={
                    <span className="text-[11px] font-medium text-slate-300">
                      {t("forward.port_local")}
                    </span>
                  }
                  placeholder="1080"
                  value={portLocal}
                  onChange={(e) => setPortLocal(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{t("forward.dynamic_desc")}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
            <div className="grid grid-cols-12 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
              <div className="col-span-12 sm:col-span-6 p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-0.5">
                  <div className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>LOCAL</span>
                  </div>
                  {renderLocalStatusBadge()}
                </div>

                <Input
                  type="text"
                  label={
                    <span className="text-[11px] font-medium text-slate-300">
                      {t("forward.ip_local")}
                    </span>
                  }
                  placeholder="127.0.0.1"
                  value={ipLocal}
                  onChange={(e) => setIpLocal(e.target.value)}
                  className="font-mono text-xs"
                />

                <Input
                  ref={portLocalInputRef}
                  type="number"
                  min={1}
                  max={65535}
                  label={
                    <span className="text-[11px] font-medium text-slate-300">
                      {t("forward.port_local")}
                    </span>
                  }
                  placeholder="8080"
                  value={portLocal}
                  onChange={(e) => setPortLocal(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="col-span-12 sm:col-span-6 p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-0.5">
                  <div className="text-[11px] font-semibold tracking-wider text-purple-400 uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>REMOTE</span>
                  </div>
                  {forwardType === "REMOTE" && isPrivilegedRemote && (
                    <span
                      className="text-[11px] text-amber-400 font-medium flex items-center gap-1 font-sans"
                      title={t("forward.port_privileged")}
                    >
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{t("forward.port_warning")}</span>
                    </span>
                  )}
                </div>

                <Input
                  ref={ipRemoteInputRef}
                  type="text"
                  label={
                    <span className="text-[11px] font-medium text-slate-300">
                      {t("forward.ip_remote")}
                    </span>
                  }
                  placeholder="localhost"
                  value={ipRemote}
                  onChange={(e) => setIpRemote(e.target.value)}
                  className="font-mono text-xs"
                />

                <Input
                  ref={portRemoteInputRef}
                  type="number"
                  min={1}
                  max={65535}
                  label={
                    <span className="text-[11px] font-medium text-slate-300">
                      {t("forward.port_remote")}
                    </span>
                  }
                  placeholder="80"
                  value={portRemote}
                  onChange={(e) => setPortRemote(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>
        )}

        <div className="px-3 py-2 rounded bg-slate-950/80 border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-300 overflow-x-auto">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-sans font-medium">
              {t("forward.flow_preview")}:
            </span>
            {forwardType === "LOCAL" && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span>Local {ipLocal.trim() || "127.0.0.1"}:{portLocal || "?"}</span>
                <ArrowRight className="w-3 h-3 text-slate-500" />
                <span>Remote {ipRemote.trim() || "localhost"}:{portRemote || "?"}</span>
              </span>
            )}
            {forwardType === "REMOTE" && (
              <span className="flex items-center gap-1.5 text-purple-400">
                <span>Remote {ipRemote.trim() || "127.0.0.1"}:{portRemote || "?"}</span>
                <ArrowRight className="w-3 h-3 text-slate-500" />
                <span>Local {ipLocal.trim() || "localhost"}:{portLocal || "?"}</span>
              </span>
            )}
            {forwardType === "DYNAMIC" && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <span>Local {ipLocal.trim() || "127.0.0.1"}:{portLocal || "?"} (SOCKS5)</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            {t("forward.cancel_edit")}
          </Button>
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={handleSaveRule}
          >
            {initialRule ? t("forward.update") : t("forward.add")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
};
