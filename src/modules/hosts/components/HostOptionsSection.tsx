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
    </div>
  );
};
