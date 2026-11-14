import React, { useEffect, useMemo, useState } from "react";
import { CornerDownLeft, KeyRound, Lock, Search, Server, X } from "lucide-react";
import { HostProfileSummaryDto } from "../types/ipc";
import { useI18n } from "../i18n";

interface CommandPaletteProps {
  isOpen: boolean;
  profiles: HostProfileSummaryDto[];
  onClose: () => void;
  onSelectHost: (host: HostProfileSummaryDto) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  profiles,
  onClose,
  onSelectHost,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const matchAlias = p.alias.toLowerCase().includes(q);
      const matchHost = p.host.toLowerCase().includes(q);
      const matchGroup = (p.group_name || "").toLowerCase().includes(q);
      const matchTag = p.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchAlias || matchHost || matchGroup || matchTag;
    });
  }, [profiles, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        onSelectHost(target);
        onClose();
      }
    }
  };

  return (
    <div
      data-modal-root="true"
      onClick={onClose}
      className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-center pt-8 sm:pt-12 p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-full flex flex-col overflow-hidden text-xs select-none"
      >
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
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-1.5">
              <Server className="w-6 h-6 text-slate-700" />
              <span>{t("palette.empty")}</span>
            </div>
          ) : (
            filtered.map((host, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={host.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    onSelectHost(host);
                    onClose();
                  }}
                  className={`px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-sky-500/15 border border-sky-500/40 text-slate-100"
                      : "bg-transparent border border-transparent text-slate-300 hover:bg-slate-800/70"
                  }`}
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
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400">
                          {host.group_name}
                        </span>
                        {host.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-300 text-[10px]"
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

                  <div className="flex items-center gap-1 text-[10px] text-sky-400 shrink-0">
                    <span>{t("palette.connect")}</span>
                    <CornerDownLeft className="w-3 h-3" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
