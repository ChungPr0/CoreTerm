import React from "react";
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Regex,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { IconButton } from "./IconButton";

export interface FindBarProps {
  isOpen: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onChangeQuery: (value: string) => void;
  caseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  wholeWord?: boolean;
  onToggleWholeWord?: () => void;
  regex: boolean;
  onToggleRegex: () => void;
  invalidRegex: boolean;
  matches: { index: number; count: number };
  onFindPrev: () => void;
  onFindNext: () => void;
  onClose: () => void;
  allowReplace?: boolean;
  showReplace?: boolean;
  onToggleReplace?: () => void;
  replaceQuery?: string;
  onChangeReplaceQuery?: (value: string) => void;
  replaceReadonly?: boolean;
  onReplaceNext?: () => void;
  onReplaceAll?: () => void;
}

export const FindBar: React.FC<FindBarProps> = ({
  isOpen,
  inputRef,
  query,
  onChangeQuery,
  caseSensitive,
  onToggleCaseSensitive,
  wholeWord = false,
  onToggleWholeWord,
  regex,
  onToggleRegex,
  invalidRegex,
  matches,
  onFindPrev,
  onFindNext,
  onClose,
  allowReplace = false,
  showReplace = false,
  onToggleReplace,
  replaceQuery = "",
  onChangeReplaceQuery,
  replaceReadonly = false,
  onReplaceNext,
  onReplaceAll,
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

  const canAct = Boolean(query && !invalidRegex);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-2.5 right-3 z-30 flex w-[392px] max-w-[calc(100%-24px)] flex-col rounded-xl border border-slate-700/80 bg-slate-900/95 px-2.5 py-1.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.7)] backdrop-blur-md select-none"
    >
      <div className="flex items-center gap-1">
        {allowReplace && onToggleReplace && (
          <IconButton
            size="sm"
            onClick={onToggleReplace}
            title={t("editor.replace")}
            icon={
              showReplace ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )
            }
          />
        )}

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
          className={`w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums truncate ${
            invalidRegex || (query && matches.count === 0) ? "text-rose-400" : "text-slate-400"
          }`}
        >
          {statusText}
        </span>

        <IconButton
          size="sm"
          tone="sky"
          active={caseSensitive}
          onClick={onToggleCaseSensitive}
          title={t("terminal.find_case")}
          icon={<CaseSensitive className="w-3.5 h-3.5" />}
        />

        {onToggleWholeWord && (
          <IconButton
            size="sm"
            tone="sky"
            active={wholeWord}
            onClick={onToggleWholeWord}
            title={t("editor.whole_word")}
            icon={<WholeWord className="w-3.5 h-3.5" />}
          />
        )}

        <IconButton
          size="sm"
          tone="sky"
          active={regex}
          onClick={onToggleRegex}
          title={t("terminal.find_regex")}
          icon={<Regex className="w-3.5 h-3.5" />}
        />

        <div className="mx-0.5 h-4 w-px bg-slate-800" />

        <IconButton
          size="sm"
          disabled={!canAct}
          onClick={onFindPrev}
          title={t("terminal.find_prev")}
          icon={<ArrowUp className="w-3.5 h-3.5" />}
        />

        <IconButton
          size="sm"
          disabled={!canAct}
          onClick={onFindNext}
          title={t("terminal.find_next")}
          icon={<ArrowDown className="w-3.5 h-3.5" />}
        />

        <IconButton
          size="sm"
          onClick={onClose}
          title={t("common.close")}
          icon={<X className="w-3.5 h-3.5" />}
        />
      </div>

      {allowReplace && showReplace && (
        <div className="mt-1.5 flex items-center gap-1 border-t border-slate-800/80 pt-1.5 pl-7">
          <Replace className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={replaceQuery}
            disabled={replaceReadonly}
            onChange={(e) => onChangeReplaceQuery?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onReplaceNext?.();
              }
            }}
            placeholder={t("editor.replace_placeholder")}
            className="flex-1 min-w-0 bg-transparent px-1 text-xs text-slate-100 placeholder:text-slate-500 outline-none select-text disabled:opacity-50"
          />

          <IconButton
            size="sm"
            disabled={replaceReadonly || !canAct || matches.count === 0}
            onClick={onReplaceNext}
            title={t("editor.replace_one")}
            icon={<Replace className="w-3.5 h-3.5" />}
          />

          <IconButton
            size="sm"
            disabled={replaceReadonly || !canAct || matches.count === 0}
            onClick={onReplaceAll}
            title={t("editor.replace_all")}
            icon={<ReplaceAll className="w-3.5 h-3.5" />}
          />
        </div>
      )}
    </div>
  );
};
