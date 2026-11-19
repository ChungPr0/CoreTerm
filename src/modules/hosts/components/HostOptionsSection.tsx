import React from "react";
import { ShieldCheck } from "lucide-react";
import type { StrictHostKeyChecking } from "../types";
import { useI18n } from "@/shared/i18n";
import { Checkbox, Input, Select } from "@/shared/ui";

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
        <Input
          type="number"
          label={t("ssh.keepalive")}
          min={0}
          max={3600}
          value={serverAliveInterval}
          onChange={(e) => onServerAliveIntervalChange(Number(e.target.value))}
          className="font-mono"
        />

        <Select
          label={t("ssh.host_checking")}
          value={strictHostKeyChecking}
          onChange={(e) =>
            onStrictHostKeyCheckingChange(e.target.value as StrictHostKeyChecking)
          }
        >
          <option value="ACCEPT_NEW">{t("ssh.accept_new")}</option>
          <option value="YES">{t("ssh.strict_yes")}</option>
          <option value="NO">{t("ssh.strict_no")}</option>
        </Select>

        <Input
          type="text"
          label={t("ssh.startup_cmd")}
          value={startupCommand}
          onChange={(e) => onStartupCommandChange(e.target.value)}
          className="font-mono"
        />
      </div>

      <div className="flex items-center gap-6">
        <Checkbox
          checked={compression}
          onCheckedChange={onCompressionChange}
          label={t("ssh.compression")}
        />

        <Checkbox
          checked={forwardAgent}
          onCheckedChange={onForwardAgentChange}
          label={t("ssh.forward_agent")}
        />
      </div>
    </div>
  );
};
