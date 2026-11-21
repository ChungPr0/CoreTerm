import React, { useEffect, useMemo, useState } from "react";
import {
  CornerDownLeft,
  FolderSync,
  KeyRound,
  Lock,
  Search,
  Server,
  X,
} from "lucide-react";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import type { ShellProfile } from "@/shared/types/ipc";
import { useI18n } from "@/shared/i18n";
import { Button, IconButton, ModalShell } from "@/shared/ui";
import { ShellIcon } from "./ShellIcon";

interface CommandPaletteProps {
  isOpen: boolean;
  isAppElevated?: boolean;
  profiles: HostProfileSummaryDto[];
  shellProfiles?: ShellProfile[];
  onClose: () => void;
  onSelectHost: (host: HostProfileSummaryDto) => void;
  onSelectShell?: (profile: ShellProfile, asAdmin?: boolean) => void;
  onOpenSftp?: (host: HostProfileSummaryDto) => void;
}

type PaletteItem =
  | { kind: "shell"; key: string; shell: ShellProfile }
  | { kind: "host"; key: string; host: HostProfileSummaryDto };

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  isAppElevated = false,
  profiles,
  shellProfiles = [],
  onClose,
  onSelectHost,
  onSelectShell,
  onOpenSftp,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedShells: PaletteItem[] = (
      onSelectShell
        ? shellProfiles.filter((s) => {
            if (!q) return true;
            return (
              s.name.toLowerCase().includes(q) ||
              s.kind.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q) ||
              "local".includes(q)
            );
          })
        : []
    ).map((shell) => ({ kind: "shell", key: `shell:${shell.id}`, shell }));

    const matchedHosts: PaletteItem[] = profiles
      .filter((p) => {
        if (!q) return true;
        return (
          p.alias.toLowerCase().includes(q) ||
          p.host.toLowerCase().includes(q) ||
          (p.group_name || "").toLowerCase().includes(q) ||
          p.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .map((host) => ({ kind: "host", key: `host:${host.id}`, host }));

    return [...matchedShells, ...matchedHosts];
  }, [profiles, shellProfiles, onSelectShell, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const activateItem = (item: PaletteItem, forceAdmin = false) => {
    if (item.kind === "shell") {
      onSelectShell?.(item.shell, isAppElevated || forceAdmin);
    } else {
      onSelectHost(item.host);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length > 0) setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = items[selectedIndex];
      if (target) activateItem(target, e.ctrlKey);
    }
  };

  const shellAdminHint = isAppElevated
    ? t("app.running_admin_hint")
    : t("palette.ctrl_admin_hint");
  const hasShellResults = items.some((item) => item.kind === "shell");

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop
      containerClassName="items-start justify-center pt-8 sm:pt-12 p-3 sm:p-4"
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-full flex flex-col overflow-hidden text-xs select-none"
    >
      <div onKeyDown={handleKeyDown} className="flex flex-col min-h-0 flex-1">
        <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center gap-2">
          <Search className="w-4 h-4 text-sky-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("palette.search")}
            className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none text-xs"
          />
          <IconButton
            size="xs"
            onClick={onClose}
            title={`${t("common.close")} (Esc)`}
            icon={<X className="w-3.5 h-3.5" />}
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
          {items.length === 0 ? (
            <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-1.5">
              <Server className="w-6 h-6 text-slate-700" />
              <span>{t("palette.empty")}</span>
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const rowClass = `px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                isSelected
                  ? "bg-sky-500/15 border border-sky-500/40 text-slate-100"
                  : "bg-transparent border border-transparent text-slate-300 hover:bg-slate-800/70"
              }`;

              if (item.kind === "shell") {
                const { shell } = item;
                return (
                  <div
                    key={item.key}
                    title={shellAdminHint}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={(e) => activateItem(item, e.ctrlKey)}
                    className={rowClass}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-800 shrink-0">
                        <ShellIcon profile={shell} isAdmin={isAppElevated} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold truncate">{shell.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                            {t("palette.local_shell")}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          {shell.executable}
                          {shell.args.length > 0 ? ` ${shell.args.join(" ")}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-sky-400 shrink-0">
                      <span>{t("palette.open")}</span>
                      <CornerDownLeft className="w-3 h-3" />
                    </div>
                  </div>
                );
              }

              const { host } = item;
              return (
                <div
                  key={item.key}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => activateItem(item)}
                  className={rowClass}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded shrink-0 ${
                        host.auth_method === "SSH_KEY"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {host.auth_method === "SSH_KEY" ? (
                        <KeyRound className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold truncate">{host.alias}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                          {host.group_name}
                        </span>
                        {host.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 text-[10px]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        {host.username}@{host.host}:{host.port}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] shrink-0">
                    {onOpenSftp && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSftp(host);
                          onClose();
                        }}
                        title={t("sftp.open_sftp_tab")}
                        leftIcon={<FolderSync className="w-3 h-3 text-sky-400" />}
                        className="h-5 px-1.5 text-[10px] border-slate-700 bg-slate-800 text-sky-300 hover:border-sky-500/40 hover:bg-sky-500/20"
                      >
                        {t("sftp.title")}
                      </Button>
                    )}
                    <div className="flex items-center gap-1 text-sky-400">
                      <span>{t("palette.connect")}</span>
                      <CornerDownLeft className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasShellResults && (
          <div className="border-t border-slate-800 px-3.5 py-1.5 text-[10px] italic text-slate-400">
            {shellAdminHint}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
