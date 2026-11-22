import React, { useMemo, useRef } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, PopoverMenu } from "@/shared/ui";
import type { EditorCursorPos, EditorLineEnding } from "../types";
import { EDITOR_LANGUAGES, getEditorLanguageById } from "../utils/editorLanguage";

interface EditorStatusBarProps {
  cursorPos: EditorCursorPos;
  totalChars: number;
  langId: string;
  langMenuOpen: boolean;
  editorReady: boolean;
  effectiveReadonly: boolean;
  zoomPercent: number;
  eol: EditorLineEnding;
  onToggleLangMenu: () => void;
  onCloseLangMenu: () => void;
  onSelectLanguage: (langId: string) => void;
  onToggleEol: () => void;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  cursorPos,
  totalChars,
  langId,
  langMenuOpen,
  editorReady,
  effectiveReadonly,
  zoomPercent,
  eol,
  onToggleLangMenu,
  onCloseLangMenu,
  onSelectLanguage,
  onToggleEol,
}) => {
  const { t } = useI18n();
  const langBtnRef = useRef<HTMLButtonElement>(null);
  const activeLang = useMemo(() => getEditorLanguageById(langId), [langId]);

  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-slate-800 bg-slate-900 px-3 text-[11px] text-slate-400 select-none overflow-hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-[126px] shrink-0 px-1 text-left tabular-nums truncate">
          {t("editor.cursor_pos", { line: cursorPos.line, col: cursorPos.col })}
        </span>

        <div className="h-3 w-px shrink-0 bg-slate-800" />

        <span className="w-[152px] shrink-0 px-1 text-left tabular-nums truncate">
          {cursorPos.selLen > 0
            ? t("editor.chars_selected_of", {
                selected: cursorPos.selLen,
                total: totalChars,
              })
            : t("editor.chars_count", { count: totalChars })}
        </span>

        <div className="h-3 w-px shrink-0 bg-slate-800" />

        <div className="relative shrink-0">
          <Button
            ref={langBtnRef}
            variant="ghost"
            size="xs"
            disabled={!editorReady}
            onClick={onToggleLangMenu}
            title={t("editor.select_language")}
            className="h-5 w-[132px] shrink-0 justify-start px-1.5 font-normal text-slate-400 hover:text-slate-100"
          >
            <span className="truncate">{activeLang.label}</span>
          </Button>

          <PopoverMenu
            isOpen={langMenuOpen}
            onClose={onCloseLangMenu}
            anchorRef={langBtnRef}
            className="absolute bottom-full left-0 z-50 mb-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-slate-700/90 bg-slate-900 py-1 shadow-2xl select-none"
          >
            {EDITOR_LANGUAGES.map((spec) => {
              const active = spec.id === langId;
              return (
                <button
                  key={spec.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onCloseLangMenu();
                    onSelectLanguage(spec.id);
                  }}
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? "bg-slate-800 font-medium text-slate-100"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 cursor-pointer"
                  }`}
                >
                  <span className="truncate">{spec.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-slate-200" />}
                </button>
              );
            })}
          </PopoverMenu>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="w-[48px] shrink-0 text-center tabular-nums">{zoomPercent}%</span>

        <div className="h-3 w-px shrink-0 bg-slate-800" />

        <Button
          variant="ghost"
          size="xs"
          disabled={effectiveReadonly || !editorReady}
          onClick={onToggleEol}
          title={t("editor.toggle_eol")}
          className="h-5 w-[116px] shrink-0 justify-center px-1.5 font-normal text-slate-400 hover:text-slate-100"
        >
          {eol === "CRLF" ? t("editor.eol_crlf") : t("editor.eol_lf")}
        </Button>

        <div className="h-3 w-px shrink-0 bg-slate-800" />

        <span className="w-[48px] shrink-0 text-center">UTF-8</span>
      </div>
    </div>
  );
};
