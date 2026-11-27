import React from "react";
import { Columns2, Terminal, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton } from "@/shared/ui";
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
        ? { dot: "bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.7)]", text: "text-sky-300", label: t("sftp.connecting") }
        : { dot: "bg-rose-400", text: "text-rose-300", label: t("sftp.disconnected") };

  return (
    <div
      onContextMenu={onContextMenu}
      className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[#21262d] bg-[#161b22] px-3 select-none"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 text-xs"
        data-tooltip={`${t("sftp.title")} — ${hostLabel}`}
      >
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${statusMeta.dot}`}
          data-tooltip={statusMeta.label}
        />
        <span className="truncate font-semibold text-[#e6edf3]">
          {t("sftp.title")} — {hostLabel}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onOpenInTerminal && remoteCwd && (
          <Button
            variant="outline"
            size="xs"
            tabIndex={-1}
            onClick={() => onOpenInTerminal(remoteCwd)}
            title={t("sftp.open_in_terminal_tooltip")}
            leftIcon={<Terminal className="h-3.5 w-3.5 text-emerald-400" />}
          >
            {t("sftp.open_in_terminal")}
          </Button>
        )}

        <Button
          variant="outline"
          size="xs"
          tabIndex={-1}
          active={showLocal}
          onClick={onToggleLocalPane}
          leftIcon={<Columns2 className="h-3.5 w-3.5" />}
        >
          {t("sftp.toggle_local_pane")}
        </Button>

        {onCloseSplit && (
          <IconButton
            size="xs"
            onClick={onCloseSplit}
            title={t("common.close")}
            icon={<X className="h-3.5 w-3.5" />}
          />
        )}
      </div>
    </div>
  );
};
