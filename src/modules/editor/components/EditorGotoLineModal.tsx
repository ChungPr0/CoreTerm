import React, { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { EditorView as CmEditorView } from "@codemirror/view";
import { CornerDownLeft, Hash } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Input } from "@/shared/ui";

interface EditorGotoLineModalProps {
  view: EditorView | null;
  isOpen: boolean;
  closeOnEscape?: boolean;
  totalLines: number;
  onClose: () => void;
}

export const EditorGotoLineModal: React.FC<EditorGotoLineModalProps> = ({
  view,
  isOpen,
  closeOnEscape = true,
  totalLines,
  onClose,
}) => {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValue("");
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const trimmed = value.trim();
  const validLine = /^\d+$/.test(trimmed) && Number(trimmed) >= 1;

  const handleConfirm = () => {
    if (!view || !validLine) return;
    const lineNum = Math.max(1, Math.min(view.state.doc.lines, Number(trimmed)));
    const line = view.state.doc.line(lineNum);

    view.dispatch({
      selection: { anchor: line.from },
      effects: CmEditorView.scrollIntoView(line.from, { y: "center" }),
    });
    onClose();
    window.requestAnimationFrame(() => view.focus());
  };

  return (
    <ActionModal
      isOpen={isOpen}
      closeOnEscape={closeOnEscape}
      onClose={() => {
        onClose();
        window.requestAnimationFrame(() => view?.focus());
      }}
      title={t("editor.goto_line_title")}
      subtitle={t("editor.goto_line_sub", { max: totalLines })}
      icon={<Hash className="h-4 w-4" />}
      iconTone="neutral"
      size="sm"
      confirmLabel={t("editor.goto_btn")}
      confirmIcon={<CornerDownLeft className="h-3.5 w-3.5" />}
      confirmDisabled={!validLine}
      onConfirm={handleConfirm}
    >
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("editor.goto_line_placeholder")}
        leftIcon={<Hash className="h-3.5 w-3.5 text-slate-500" />}
        inputClassName="font-mono"
      />
    </ActionModal>
  );
};
