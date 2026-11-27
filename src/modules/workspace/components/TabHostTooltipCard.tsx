import React from "react";
import { FolderSync, Server } from "lucide-react";
import { LOCAL_HOST_ID } from "@/shared/defaults";
import type { SessionState, TerminalTabItem } from "@/shared/types/ipc";

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface TabStatusIndicator {
  dotClass: string;
  textClass: string;
  label: string;
}

export function getTabStatusIndicator(
  state: SessionState,
  t: TranslateFn
): TabStatusIndicator {
  switch (state) {
    case "CONNECTING":
    case "HANDSHAKING":
      return {
        dotClass:
          "bg-sky-400 animate-pulse shadow-[0_0_8px_rgba(56,189,248,0.75)]",
        textClass: "text-sky-300",
        label: t("status.connecting"),
      };
    case "ONLINE":
      return {
        dotClass: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]",
        textClass: "text-emerald-300",
        label: t("status.online"),
      };
    case "AUTH_FAILED":
      return {
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
        textClass: "text-rose-300",
        label: t("status.auth_failed"),
      };
    case "PORT_CONFLICT":
      return {
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
        textClass: "text-rose-300",
        label: t("status.port_conflict"),
      };
    case "DISCONNECTED":
    case "ERROR":
    default:
      return {
        dotClass: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]",
        textClass: "text-rose-300",
        label:
          state === "DISCONNECTED"
            ? t("status.disconnected")
            : t("status.error"),
      };
  }
}

export function formatTabTooltipTitle(
  tab: TerminalTabItem,
  statusLabel: string,
  t: TranslateFn
): string {
  const isEditor = tab.tabKind === "editor";
  const isSettings = tab.tabKind === "settings";
  const isRemoteEditor = isEditor && tab.editorFile?.kind === "remote";
  const isLocal = !isEditor && !isSettings && tab.hostId === LOCAL_HOST_ID;

  if (isSettings) return t("settings.title");
  if (isEditor) {
    const base = `${tab.editorFile?.hostLabel ?? ""} — ${tab.editorFile?.path ?? tab.title}`;
    return isRemoteEditor ? `${base} — ${statusLabel}` : base;
  }
  if (isLocal) {
    return tab.isAdmin ? `${tab.title} (${t("app.admin_badge")})` : tab.title;
  }
  if (tab.tabKind === "sftp") {
    return `${t("sftp.title")}: ${tab.title} (${tab.hostSubtitle}) — ${statusLabel}`;
  }
  return `${tab.title} (${tab.hostSubtitle}) — ${statusLabel}`;
}

interface TabHostTooltipCardProps {
  title: string;
  hostSubtitle: string;
  isSftpTab: boolean;
  sftpSplitOpen: boolean;
  forwardCount: number;
  status: TabStatusIndicator;
  t: TranslateFn;
}

export const TabHostTooltipCard: React.FC<TabHostTooltipCardProps> = ({
  title,
  hostSubtitle,
  isSftpTab,
  sftpSplitOpen,
  forwardCount,
  status,
  t,
}) => {
  const showBadges = forwardCount > 0 || (!isSftpTab && sftpSplitOpen);

  return (
    <div className="min-w-[196px] max-w-[280px] space-y-2">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
              isSftpTab
                ? "border-sky-500/30 bg-sky-500/15 text-sky-400"
                : "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {isSftpTab ? (
              <FolderSync className="h-3.5 w-3.5" />
            ) : (
              <Server className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold leading-tight text-slate-100">
              {title}
            </div>
            {hostSubtitle && (
              <div className="mt-0.5 truncate font-mono text-[11px] leading-tight text-slate-400">
                {hostSubtitle}
              </div>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none ${
            isSftpTab
              ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
              : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
          }`}
        >
          {isSftpTab ? t("sftp.title") : t("ssh.badge")}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-800/90 pt-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status.dotClass}`} />
          <span className={status.textClass}>{status.label}</span>
        </span>
        {showBadges && (
          <div className="flex shrink-0 items-center gap-1">
            {!isSftpTab && sftpSplitOpen && (
              <span className="rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-300">
                {t("sftp.title")}
              </span>
            )}
            {forwardCount > 0 && (
              <span className="rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none text-sky-300">
                {t("forward.badge_count", { count: forwardCount })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
