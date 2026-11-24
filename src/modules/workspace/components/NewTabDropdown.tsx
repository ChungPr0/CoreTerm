import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
} from "lucide-react";
import { PopoverMenu } from "@/shared/ui";
import { useI18n } from "@/shared/i18n";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import type { SettingsCategoryId, ShellProfile } from "@/shared/types/ipc";
import { ShellIcon } from "./ShellIcon";

interface NewTabDropdownProps {
  isAppElevated: boolean;
  isModalOpen: boolean;
  isContextMenuOpen?: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  profiles: HostProfileSummaryDto[];
  onNewTab: (opts?: { profile?: ShellProfile; asAdmin?: boolean }) => void;
  onRescan?: () => Promise<void> | void;
  onConnectProfile: (host: HostProfileSummaryDto) => void;
  onCreateNewHost: () => void;
  onOpenPalette: () => void;
  onOpenSettings: (section?: SettingsCategoryId) => void;
}

export const NewTabDropdown: React.FC<NewTabDropdownProps> = ({
  isAppElevated,
  isModalOpen,
  isContextMenuOpen = false,
  shellProfiles,
  defaultShellProfile,
  profiles,
  onNewTab,
  onRescan,
  onConnectProfile,
  onCreateNewHost,
  onOpenPalette,
  onOpenSettings,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [showPlusTip, setShowPlusTip] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [menuLeft, setMenuLeft] = useState(120);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isModalOpen || isContextMenuOpen) {
      setIsOpen(false);
      setShowPlusTip(false);
    }
  }, [isModalOpen, isContextMenuOpen]);

  const toggleMenu = () => {
    setShowPlusTip(false);
    setIsOpen((prev) => {
      const next = !prev;
      if (next && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setMenuLeft(Math.max(8, Math.min(rect.left, window.innerWidth - 290)));
      }
      return next;
    });
  };

  const displayShells =
    shellProfiles.length > 0
      ? shellProfiles
      : defaultShellProfile
      ? [defaultShellProfile]
      : [];

  const adminHint = isAppElevated
    ? t("app.running_admin_hint")
    : t("app.ctrl_admin_hint");

  const handleRescan = async () => {
    if (!onRescan || isScanning) return;
    setIsScanning(true);
    try {
      await onRescan();
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      ref={anchorRef}
      className={`relative flex items-center shrink-0 transition-opacity ${
        isModalOpen ? "opacity-45 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center rounded-md overflow-hidden border border-transparent hover:border-slate-800 bg-transparent hover:bg-slate-900/80 transition-colors">
        <button
          type="button"
          onMouseEnter={() => {
            if (!isOpen && !isModalOpen && !isContextMenuOpen) setShowPlusTip(true);
          }}
          onMouseLeave={() => setShowPlusTip(false)}
          onClick={(e) => {
            setIsOpen(false);
            setShowPlusTip(false);
            if (!defaultShellProfile) {
              onOpenSettings("shells");
              return;
            }
            onNewTab({
              profile: defaultShellProfile,
              asAdmin: isAppElevated || e.ctrlKey,
            });
          }}
          aria-label={
            defaultShellProfile
              ? `${t("app.new_tab_tooltip", { name: defaultShellProfile.name })} (Ctrl+Shift+T) — ${adminHint}`
              : t("app.no_shell_hint")
          }
          className="inline-flex h-7 w-7 items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={toggleMenu}
          title={t("app.new_tab_menu")}
          className="inline-flex h-7 items-center justify-center px-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors border-l border-slate-800/60"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {showPlusTip && !isOpen && !isModalOpen && !isContextMenuOpen && (
        <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-40 whitespace-nowrap rounded-lg border border-slate-700/85 bg-slate-900/95 px-2.5 py-1.5 text-[11px] shadow-[0_10px_28px_rgba(0,0,0,0.65)] backdrop-blur-md">
          {defaultShellProfile ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-100">
                  {t("app.new_tab_tooltip", { name: defaultShellProfile.name })}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Ctrl+Shift+T
                </span>
              </div>
              <div className="text-[10px] italic text-slate-400">{adminHint}</div>
            </>
          ) : (
            <div className="font-medium text-amber-300">
              {t("app.no_shell_hint")}
            </div>
          )}
        </div>
      )}

      <PopoverMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        style={{ left: menuLeft }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="fixed top-9 mt-0.5 min-w-[240px] max-w-[300px] py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_14px_40px_rgba(0,0,0,0.72)] text-xs z-50"
      >
        <div className="px-3 py-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {t("app.local_shells")}
          </span>
          {onRescan && (
            <button
              type="button"
              disabled={isScanning}
              title={t("app.rescan")}
              onClick={() => void handleRescan()}
              className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-slate-800/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        <div className="max-h-56 overflow-y-auto space-y-0.5 pl-1.5 pr-[1px]">
          {displayShells.length === 0 ? (
            <div className="px-2 py-2 space-y-1.5 text-[11px]">
              <div className="text-slate-400">{t("app.no_shells")}</div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings("shells");
                }}
                className="w-full px-2 py-1.5 rounded-lg flex items-center gap-2 text-left text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 transition-colors font-medium"
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span>{t("app.add_shell")}</span>
              </button>
            </div>
          ) : (
            displayShells.map((shell) => {
              const isDefault = shell.id === defaultShellProfile?.id;
              return (
                <button
                  key={shell.id}
                  type="button"
                  title={adminHint}
                  onClick={(e) => {
                    setIsOpen(false);
                    onNewTab({ profile: shell, asAdmin: isAppElevated || e.ctrlKey });
                  }}
                  className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left text-slate-200 hover:bg-sky-500/15 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ShellIcon profile={shell} isAdmin={isAppElevated} />
                    <span className="truncate font-medium">{shell.name}</span>
                  </span>
                  {isDefault && (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-[9px] font-medium leading-none text-sky-300">
                        {t("app.default_badge")}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Ctrl+Shift+T
                      </span>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {profiles.length > 0 && (
          <>
            <div className="my-1.5 border-t border-slate-800/90" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {t("ctx.saved_hosts")}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5 pl-1.5 pr-[1px]">
              {profiles.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onConnectProfile(p);
                  }}
                  className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left text-slate-300 hover:bg-sky-500/15 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Server className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate font-medium">{p.alias}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 truncate max-w-[95px]">
                    {p.host}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="my-1.5 border-t border-slate-800/90" />
        <div className="px-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onCreateNewHost();
            }}
            className="w-full px-2 py-1.5 rounded-lg flex items-center gap-2 text-left text-sky-300 hover:bg-sky-500/15 hover:text-sky-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-medium">{t("ctx.new_connection")}</span>
          </button>
        </div>

        <div className="my-1.5 border-t border-slate-800/90" />
        <div className="px-1.5 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenPalette();
            }}
            className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-3 text-left text-slate-200 hover:bg-sky-500/15 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate font-medium">{t("ctx.quick_jump")}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500 shrink-0">Ctrl+Shift+K</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenSettings();
            }}
            className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-3 text-left text-slate-200 hover:bg-sky-500/15 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <SettingsIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="truncate font-medium">{t("ctx.settings")}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500 shrink-0">Ctrl+,</span>
          </button>
        </div>
      </PopoverMenu>
    </div>
  );
};
