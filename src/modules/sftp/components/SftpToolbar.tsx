import React from "react";
import { Columns2, Terminal, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { SftpConnectionState } from "../types";

interface SftpToolbarProps {
  hostLabel: string;
  connState: SftpConnectionState;
  remoteCwd: string;
  showLocal: boolean;
  onOpenInTerminal?: (remotePath: string) => void;
  onToggleLocalPane: () => void;
  onCloseSplit?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const SftpToolbar: React.FC<SftpToolbarProps> = ({
  hostLabel,
  connState,
  remoteCwd,
  showLocal,
  onOpenInTerminal,
  onToggleLocalPane,
  onCloseSplit,
  onContextMenu,
}) => {
  const { t } = useI18n();

  const statusMeta =
    connState === "CONNECTED"
      ? { dot: "bg-emerald-400", text: "text-emerald-300", label: t("sftp.connected") }
      : connState === "CONNECTING"
        ? { dot: "bg-amber-400 animate-pulse", text: "text-amber-300", label: t("sftp.connecting") }
        : { dot: "bg-red-400", text: "text-red-300", label: t("sftp.disconnected") };

  return (
    <div
      onContextMenu={onContextMenu}
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#21262d] bg-[#161b22] px-3 py-1.5"
    >
      <div className="flex min-h-6 flex-wrap items-center gap-2.5 text-xs">
        <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
        <span className="font-semibold text-[#e6edf3]">
          {t("sftp.title")} — {hostLabel}
        </span>
        <span className={`text-[11px] font-medium ${statusMeta.text}`}>{statusMeta.label}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {onOpenInTerminal && remoteCwd && (
          <button
            type="button"
            onClick={() => onOpenInTerminal(remoteCwd)}
            title={t("sftp.open_in_terminal_tooltip")}
            className="inline-flex h-6 items-center gap-1 rounded border border-[#30363d] bg-[#0d1117] px-2 text-[11px] text-[#c9d1d9] hover:border-[#388bfd] hover:text-white"
          >
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span>{t("sftp.open_in_terminal")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleLocalPane}
          className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] ${
            showLocal
              ? "border-[#388bfd]/60 bg-[#1f6feb]/20 text-[#58a6ff]"
              : "border-[#30363d] bg-[#0d1117] text-[#c9d1d9] hover:border-[#388bfd]"
          }`}
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span>{t("sftp.toggle_local_pane")}</span>
        </button>

        {onCloseSplit && (
          <button
            type="button"
            onClick={onCloseSplit}
            title={t("common.close")}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
