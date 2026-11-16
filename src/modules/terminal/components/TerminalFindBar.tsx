import React from "react";
import { ArrowDown, ArrowUp, CaseSensitive, Regex, Search, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";

interface TerminalFindBarProps {
  isOpen: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onChangeQuery: (value: string) => void;
  caseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  regex: boolean;
  onToggleRegex: () => void;
  invalidRegex: boolean;
  matches: { index: number; count: number };
  onFindPrev: () => void;
  onFindNext: () => void;
  onClose: () => void;
}

export const TerminalFindBar: React.FC<TerminalFindBarProps> = ({
  isOpen,
  inputRef,
  query,
  onChangeQuery,
  caseSensitive,
  onToggleCaseSensitive,
  regex,
  onToggleRegex,
  invalidRegex,
  matches,
  onFindPrev,
  onFindNext,
  onClose,
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  const statusText = invalidRegex
    ? t("terminal.find_invalid_regex")
    : !query
      ? ""
      : matches.count > 0
        ? `${matches.index || 1}/${matches.count}`
        : t("terminal.find_no_results");

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-2.5 right-3 z-30 flex w-[364px] max-w-[calc(100%-24px)] items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/95 px-2.5 py-1.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.7)] backdrop-blur-md select-none"
    >
      <Search className="w-3.5 h-3.5 text-sky-400 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChangeQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) onFindPrev();
            else onFindNext();
          }
        }}
        placeholder={t("terminal.find_placeholder")}
        className={`flex-1 min-w-0 bg-transparent px-1 text-xs text-slate-100 placeholder:text-slate-500 outline-none select-text ${
          invalidRegex ? "text-rose-300" : ""
        }`}
      />

      <span
        title={statusText || undefined}
        className={`w-[82px] shrink-0 text-right font-mono text-[11px] tabular-nums truncate ${
          invalidRegex || (query && matches.count === 0) ? "text-rose-400" : "text-slate-400"
        }`}
      >
        {statusText}
      </span>

      <button
        type="button"
        onClick={onToggleCaseSensitive}
        title={t("terminal.find_case")}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] transition-colors ${
          caseSensitive
            ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
            : "border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        }`}
      >
        <CaseSensitive className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onToggleRegex}
        title={t("terminal.find_regex")}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] transition-colors ${
          regex
            ? "border-sky-500/50 bg-sky-500/20 text-sky-300"
            : "border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        }`}
      >
        <Regex className="w-3.5 h-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-slate-800" />

      <button
        type="button"
        disabled={!query || invalidRegex}
        onClick={onFindPrev}
        title={t("terminal.find_prev")}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <ArrowUp className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        disabled={!query || invalidRegex}
        onClick={onFindNext}
        title={t("terminal.find_next")}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <ArrowDown className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onClose}
        title={t("common.close")}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
