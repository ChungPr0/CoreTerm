import React from "react";
import { ShieldCheck } from "lucide-react";
import type { StrictHostKeyChecking } from "../types";
import { useI18n } from "@/shared/i18n";

interface HostOptionsSectionProps {
  serverAliveInterval: number;
  onServerAliveIntervalChange: (val: number) => void;
  strictHostKeyChecking: StrictHostKeyChecking;
  onStrictHostKeyCheckingChange: (val: StrictHostKeyChecking) => void;
  startupCommand: string;
  onStartupCommandChange: (val: string) => void;
  compression: boolean;
  onCompressionChange: (val: boolean) => void;
  forwardAgent: boolean;
  onForwardAgentChange: (val: boolean) => void;
  telemetryEnabled: boolean;
  onTelemetryEnabledChange: (val: boolean) => void;
  telemetryIntervalSec: number;
  onTelemetryIntervalSecChange: (val: number) => void;
  autoReconnect: boolean;
  onAutoReconnectChange: (val: boolean) => void;
  reconnectIntervalSec: number;
  onReconnectIntervalSecChange: (val: number) => void;
}

export const HostOptionsSection: React.FC<HostOptionsSectionProps> = ({
  serverAliveInterval,
  onServerAliveIntervalChange,
  strictHostKeyChecking,
  onStrictHostKeyCheckingChange,
  startupCommand,
  onStartupCommandChange,
  compression,
  onCompressionChange,
  forwardAgent,
  onForwardAgentChange,
  telemetryEnabled,
  onTelemetryEnabledChange,
  telemetryIntervalSec,
  onTelemetryIntervalSecChange,
  autoReconnect,
  onAutoReconnectChange,
  reconnectIntervalSec,
  onReconnectIntervalSecChange,
}) => {
  const { t } = useI18n();

  return (
    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-3">
      <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
        <ShieldCheck className="w-4 h-4 text-sky-400" />
        <span>{t("ssh.title")}</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-slate-400 mb-1">
            {t("ssh.keepalive")}
          </label>
          <input
            type="number"
            min={0}
            max={3600}
            value={serverAliveInterval}
            onChange={(e) => onServerAliveIntervalChange(Number(e.target.value))}
            className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
          />
        </div>

        <div>
          <label className="block text-slate-400 mb-1">
            {t("ssh.host_checking")}
          </label>
          <select
            value={strictHostKeyChecking}
            onChange={(e) =>
              onStrictHostKeyCheckingChange(e.target.value as StrictHostKeyChecking)
            }
            className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100"
          >
            <option value="ACCEPT_NEW">{t("ssh.accept_new")}</option>
            <option value="YES">{t("ssh.strict_yes")}</option>
            <option value="NO">{t("ssh.strict_no")}</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">
            {t("ssh.startup_cmd")}
          </label>
          <input
            type="text"
            value={startupCommand}
            onChange={(e) => onStartupCommandChange(e.target.value)}
            className="w-full h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={compression}
            onChange={(e) => onCompressionChange(e.target.checked)}
          />
          <span>{t("ssh.compression")}</span>
        </label>

        <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={forwardAgent}
            onChange={(e) => onForwardAgentChange(e.target.checked)}
          />
          <span>{t("ssh.forward_agent")}</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
        <div className="flex min-h-[46px] items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-900/60 border border-slate-800">
          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
            <input
              type="checkbox"
              checked={telemetryEnabled}
              onChange={(e) => onTelemetryEnabledChange(e.target.checked)}
            />
            <span>{t("telemetry.enabled")}</span>
          </label>

          {telemetryEnabled && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">
                {t("telemetry.interval")}:
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={telemetryIntervalSec}
                onChange={(e) => onTelemetryIntervalSecChange(Number(e.target.value))}
                className="w-14 h-7 px-2 rounded bg-slate-950 border border-slate-800 text-slate-100 font-mono text-right"
              />
            </div>
          )}
        </div>

        <div className="flex min-h-[46px] items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-900/60 border border-slate-800">
          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
            <input
              type="checkbox"
              checked={autoReconnect}
              onChange={(e) => onAutoReconnectChange(e.target.checked)}
            />
            <span>{t("session.auto_reconnect")}</span>
          </label>

          {autoReconnect && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">
                {t("session.reconnect_interval")}:
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={reconnectIntervalSec}
                onChange={(e) => onReconnectIntervalSecChange(Number(e.target.value))}
                className="w-14 h-7 px-2 rounded bg-slate-950 border border-slate-800 text-slate-100 font-mono text-right"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
