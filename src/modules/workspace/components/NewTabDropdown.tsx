import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Search, Server, Settings as SettingsIcon } from "lucide-react";
import { PopoverMenu } from "@/shared/ui";
import { useI18n } from "@/shared/i18n";
import type { HostProfileSummaryDto } from "@/modules/hosts";
import type { ShellProfile } from "@/shared/types/ipc";
import { ShellIcon } from "./ShellIcon";

interface NewTabDropdownProps {
  isAppElevated: boolean;
  isModalOpen: boolean;
  isContextMenuOpen?: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile;
  profiles: HostProfileSummaryDto[];
  onNewTab: (opts?: { profile?: ShellProfile; asAdmin?: boolean }) => void;
  onConnectProfile: (host: HostProfileSummaryDto) => void;
  onCreateNewHost: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}

export const NewTabDropdown: React.FC<NewTabDropdownProps> = ({
  isAppElevated,
  isModalOpen,
  isContextMenuOpen = false,
  shellProfiles,
  defaultShellProfile,
  profiles,
  onNewTab,
  onConnectProfile,
  onCreateNewHost,
  onOpenPalette,
  onOpenSettings,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [showPlusTip, setShowPlusTip] = useState(false);
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
    shellProfiles.length > 0 ? shellProfiles : [defaultShellProfile];

  const adminHint = isAppElevated
    ? t("app.running_admin_hint")
    : t("app.ctrl_admin_hint");

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
            onNewTab({
              profile: defaultShellProfile,
              asAdmin: isAppElevated || e.ctrlKey,
            });
          }}
          aria-label={`${t("app.new_tab_tooltip", { name: defaultShellProfile.name })} — ${adminHint}`}
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
          <div className="font-medium text-slate-100">
            {t("app.new_tab_tooltip", { name: defaultShellProfile.name })}
          </div>
          <div className="text-[10px] italic text-slate-400">{adminHint}</div>
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
        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {t("app.local_shells")}
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5 px-1.5">
          {displayShells.map((shell) => {
            const isDefault = shell.id === defaultShellProfile.id;
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
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-[9px] font-medium leading-none text-sky-300 shrink-0">
                    {t("app.default_badge")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {profiles.length > 0 && (
          <>
            <div className="my-1.5 border-t border-slate-800/90" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {t("ctx.saved_hosts")}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5 px-1.5">
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
