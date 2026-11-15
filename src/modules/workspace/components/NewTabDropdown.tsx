import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Plus,
  Server,
  Shield,
  Terminal as TerminalIcon,
} from "lucide-react";
import { PopoverMenu } from "@/shared/ui";
import { useI18n } from "@/shared/i18n";
import type { HostProfileSummaryDto } from "@/modules/hosts";

interface NewTabDropdownProps {
  isAppElevated: boolean;
  isModalOpen: boolean;
  profiles: HostProfileSummaryDto[];
  onNewTab: (asAdmin?: boolean) => void;
  onConnectProfile: (host: HostProfileSummaryDto) => void;
  onCreateNewHost: () => void;
}

export const NewTabDropdown: React.FC<NewTabDropdownProps> = ({
  isAppElevated,
  isModalOpen,
  profiles,
  onNewTab,
  onConnectProfile,
  onCreateNewHost,
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState(120);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isModalOpen) setIsOpen(false);
  }, [isModalOpen]);

  const toggleMenu = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setMenuLeft(Math.max(8, Math.min(rect.left, window.innerWidth - 260)));
      }
      return next;
    });
  };

  return (
    <div
      ref={anchorRef}
      className={`relative flex items-center shrink-0 transition-opacity ${
        isModalOpen ? "opacity-45 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center rounded-md overflow-hidden border border-transparent hover:border-slate-800 bg-transparent hover:bg-slate-900/70">
        <button
          type="button"
          onClick={() => onNewTab(isAppElevated)}
          title={isAppElevated ? t("app.local_admin") : t("status.new_tab")}
          className="inline-flex h-7 w-7 items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={toggleMenu}
          title={t("app.new_tab_menu")}
          className="inline-flex h-7 items-center justify-center px-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors border-l border-slate-800/70"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <PopoverMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        style={{ left: menuLeft }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="fixed top-9 mt-0.5 min-w-[230px] max-w-[280px] py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_14px_40px_rgba(0,0,0,0.72)] text-xs z-50"
      >
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            onNewTab(isAppElevated);
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-slate-200 hover:bg-sky-500/15 hover:text-white transition-colors"
        >
          {isAppElevated ? (
            <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <TerminalIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          )}
          <span className="truncate font-medium">
            {isAppElevated ? t("app.local_admin") : t("app.local_shell")}
          </span>
        </button>

        {!isAppElevated && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onNewTab(true);
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-medium">{t("app.local_admin")}</span>
          </button>
        )}

        {profiles.length > 0 && (
          <>
            <div className="my-1 border-t border-slate-800" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {t("ctx.saved_hosts")}
            </div>
            <div className="max-h-48 overflow-y-auto">
              {profiles.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onConnectProfile(p);
                  }}
                  className="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left text-slate-300 hover:bg-sky-500/15 hover:text-white transition-colors"
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

        <div className="my-1 border-t border-slate-800" />
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            onCreateNewHost();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-sky-300 hover:bg-sky-500/15 hover:text-sky-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate font-medium">{t("ctx.new_connection")}</span>
        </button>
      </PopoverMenu>
    </div>
  );
};
