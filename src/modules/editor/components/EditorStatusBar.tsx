import React, { useMemo } from "react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui";
import type { EditorCursorPos, EditorLineEnding } from "../types";
import { getEditorLanguageById } from "../utils/editorLanguage";

interface EditorStatusBarProps {
  cursorPos: EditorCursorPos;
  totalChars: number;
  langId: string;
  editorReady: boolean;
  effectiveReadonly: boolean;
  zoomPercent: number;
  eol: EditorLineEnding;
  onToggleEol: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  cursorPos,
  totalChars,
  langId,
  editorReady,
  effectiveReadonly,
  zoomPercent,
  eol,
  onToggleEol,
  onContextMenu,
}) => {
  const { t } = useI18n();
  const activeLang = useMemo(() => getEditorLanguageById(langId), [langId]);

  return (
    <div
      onContextMenu={onContextMenu}
      className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-[#21262d] bg-[#161b22] px-3 text-[11px] text-[#8b949e] select-none overflow-hidden"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="w-[126px] shrink-0 px-1 text-left tabular-nums truncate">
          {t("editor.cursor_pos", { line: cursorPos.line, col: cursorPos.col })}
        </span>

        <div className="h-3 w-px shrink-0 bg-[#21262d]" />

        <span className="w-[152px] shrink-0 px-1 text-left tabular-nums truncate">
          {cursorPos.selLen > 0
            ? t("editor.chars_selected_of", {
                selected: cursorPos.selLen,
                total: totalChars,
              })
            : t("editor.chars_count", { count: totalChars })}
        </span>

        <div className="h-3 w-px shrink-0 bg-[#21262d]" />

        <span
          title={activeLang.label}
          className="w-[132px] shrink-0 px-1 text-left truncate cursor-default text-[#8b949e]"
        >
          {activeLang.label}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="w-[48px] shrink-0 text-center tabular-nums">{zoomPercent}%</span>

        <div className="h-3 w-px shrink-0 bg-[#21262d]" />

        {effectiveReadonly ? (
          <span
            title={t("editor.lock_readonly_file")}
            className="w-[116px] shrink-0 px-1 text-center truncate cursor-default text-slate-400"
          >
            {eol === "CRLF" ? t("editor.eol_crlf") : t("editor.eol_lf")}
          </span>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            disabled={!editorReady}
            onClick={onToggleEol}
            title={t("editor.toggle_eol")}
            className="h-5 w-[116px] shrink-0 justify-center px-1.5 font-normal text-slate-400 hover:text-slate-100"
          >
            {eol === "CRLF" ? t("editor.eol_crlf") : t("editor.eol_lf")}
          </Button>
        )}

        <div className="h-3 w-px shrink-0 bg-slate-800" />

        <span className="w-[48px] shrink-0 text-center">UTF-8</span>
      </div>
    </div>
  );
};
