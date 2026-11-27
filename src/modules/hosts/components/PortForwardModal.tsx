import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Info, Network, X } from "lucide-react";
import type { ForwardType } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton, Input, ModalShell, Select, useAlert } from "@/shared/ui";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";
import { hostsApi } from "../api/hostsApi";
import type { PortProbeResultDto } from "../types";
import {
  findDuplicateForwardRule,
  isInvalidForwardHostOrAddr,
  isPrivilegedPort,
  isValidPortNumber,
} from "../utils/portForwardValidation";
import type { DraftPortForward } from "./hostFormTypes";
import { PortForwardFlowPreview } from "./PortForwardFlowPreview";
import { PortForwardStatusBadge } from "./PortForwardStatusBadge";

interface PortForwardModalProps {
  isOpen: boolean;
  initialRule: DraftPortForward | null;
  existingRules: DraftPortForward[];
  editingIndex: number | null;
  onClose: () => void;
  onSave: (rule: DraftPortForward) => void;
}

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

  const isPrivilegedLocal = useMemo(() => isPrivilegedPort(portLocal), [portLocal]);
  const isPrivilegedRemote = useMemo(() => isPrivilegedPort(portRemote), [portRemote]);

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
    if (!isValidPortNumber(portNum) || isInvalidForwardHostOrAddr(ipLocal)) {
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

  const duplicateInfo = useMemo(
    () =>
      findDuplicateForwardRule({
        forwardType,
        portLocal,
        ipLocal,
        portRemote,
        ipRemote,
        existingRules,
        editingIndex,
      }),
    [forwardType, portLocal, ipLocal, portRemote, ipRemote, existingRules, editingIndex]
  );

  const handleSaveRule = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const portLocalNum = Number(portLocal);
    if (!isValidPortNumber(portLocalNum)) {
      scrollAndFocusInput(portLocalInputRef.current);
      alert.error(t("errors.forward_port_range"));
      return;
    }

    const cleanIpLocal = ipLocal.trim() || "127.0.0.1";
    if (isInvalidForwardHostOrAddr(cleanIpLocal)) {
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
      if (isInvalidForwardHostOrAddr(cleanIpRemote)) {
        scrollAndFocusInput(ipRemoteInputRef.current);
        alert.error(t("errors.forward_target_host_invalid"));
        return;
      }
      if (!isValidPortNumber(portRemoteNum)) {
        scrollAndFocusInput(portRemoteInputRef.current);
        alert.error(t("errors.forward_port_range"));
        return;
      }
    }

    const listenPort = forwardType === "REMOTE" ? portRemoteNum : portLocalNum;
    if (duplicateInfo.isDuplicate) {
      scrollAndFocusInput(
        forwardType === "REMOTE" ? portRemoteInputRef.current : portLocalInputRef.current
      );
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
        <IconButton
          size="md"
          onClick={onClose}
          title={t("common.close")}
          icon={<X className="w-4 h-4" />}
        />
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
              <div className="flex items-center justify-between gap-2 pb-0.5">
                <div className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>LOCAL (SOCKS5)</span>
                </div>
                <PortForwardStatusBadge
                  forwardType={forwardType}
                  portLocal={portLocal}
                  portProbe={portProbe}
                  isPrivilegedLocal={isPrivilegedLocal}
                  isCheckingPort={isCheckingPort}
                />
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
                      {`${t("forward.port_local")} *`}
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
                <div className="flex items-center justify-between gap-2 pb-0.5">
                  <div className="text-[11px] font-semibold tracking-wider text-emerald-400 uppercase flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span>LOCAL</span>
                  </div>
                  <PortForwardStatusBadge
                    forwardType={forwardType}
                    portLocal={portLocal}
                    portProbe={portProbe}
                    isPrivilegedLocal={isPrivilegedLocal}
                    isCheckingPort={isCheckingPort}
                  />
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
                      {`${t("forward.port_local")} *`}
                    </span>
                  }
                  placeholder="8080"
                  value={portLocal}
                  onChange={(e) => setPortLocal(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="col-span-12 sm:col-span-6 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 pb-0.5">
                  <div className="text-[11px] font-semibold tracking-wider text-purple-400 uppercase flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span>REMOTE</span>
                  </div>
                  {forwardType === "REMOTE" && isPrivilegedRemote && (
                    <span
                      className="text-[11px] text-amber-400 font-medium flex items-center gap-1 font-sans whitespace-nowrap shrink-0"
                      data-tooltip={t("forward.port_privileged")}
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
                      {`${t("forward.port_remote")} *`}
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

        <PortForwardFlowPreview
          forwardType={forwardType}
          ipLocal={ipLocal}
          portLocal={portLocal}
          ipRemote={ipRemote}
          portRemote={portRemote}
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            {t("forward.cancel_edit")}
          </Button>
          <Button variant="primary" size="md" type="button" onClick={handleSaveRule}>
            {initialRule ? t("forward.update") : t("forward.add")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
};
