import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import {
  THEME_SEARCH_ACTIVE_BG,
  THEME_SEARCH_ACTIVE_BORDER,
  THEME_SEARCH_MATCH_BG,
  THEME_SEARCH_MATCH_BORDER,
  THEME_SELECTION_BG,
} from "@/shared/defaults";

export function createCoreTermEditorTheme(fontSizePx: number): Extension {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        color: "#d4dae3",
        backgroundColor: "var(--ct-bg-editor, #0c0f14)",
        fontSize: `${fontSizePx}px`,
        fontFamily:
          "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace",
      },
      ".cm-scroller": {
        overflow: "auto",
        lineHeight: "1.55",
        fontFamily: "inherit",
      },
      ".cm-content": {
        caretColor: "#e2e8f0",
        padding: "8px 0 24px 0",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "#e2e8f0",
        borderLeftWidth: "1.5px",
      },
      "&.cm-focused": {
        outline: "none",
      },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: `${THEME_SELECTION_BG} !important`,
        },
      ".cm-activeLine": {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--ct-bg-editor, #0c0f14)",
        color: "#4e5866",
        borderRight: "1px solid #1d222b",
        paddingRight: "4px",
        userSelect: "none",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "40px",
        padding: "0 8px 0 12px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        color: "#aeb7c4",
      },
      ".cm-foldGutter .cm-gutterElement": {
        padding: "0 4px",
        color: "#4e5866",
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "var(--ct-bg-surface, #161b22)",
        border: "1px solid #2b323d",
        color: "#8b949e",
        borderRadius: "3px",
        padding: "0 4px",
      },
      ".cm-searchMatch": {
        backgroundColor: THEME_SEARCH_MATCH_BG,
        outline: `1px solid ${THEME_SEARCH_MATCH_BORDER}`,
        borderRadius: "2px",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: `${THEME_SEARCH_ACTIVE_BG} !important`,
        outline: `1.5px solid ${THEME_SEARCH_ACTIVE_BORDER} !important`,
        borderRadius: "2px",
      },
      ".cm-selectionMatch": {
        backgroundColor: "rgba(148, 163, 184, 0.25)",
        outline: "1px solid rgba(148, 163, 184, 0.45)",
        borderRadius: "2px",
      },
      ".cm-matchingBracket": {
        backgroundColor: "rgba(148, 163, 184, 0.2)",
        outline: "1px solid rgba(148, 163, 184, 0.45)",
      },
    },
    { dark: true }
  );
}

const coreTermHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "#cf8e6d" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#d4dae3" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#8fb4dc" },
  { tag: [t.propertyName, t.attributeName], color: "#9eb8d6" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#b59cd6" },
  { tag: [t.definition(t.name), t.separator], color: "#d4dae3" },
  { tag: [t.typeName, t.className, t.changed, t.annotation, t.self, t.namespace], color: "#d4b483" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#7eb8a8" },
  { tag: [t.operator, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#9fb3c8" },
  { tag: [t.meta, t.comment], color: "#636e7b", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold", color: "#e2e8f0" },
  { tag: t.emphasis, fontStyle: "italic", color: "#d4dae3" },
  { tag: t.heading, fontWeight: "bold", color: "#e2e8f0" },
  { tag: [t.string, t.inserted], color: "#8ec07c" },
  { tag: t.tagName, color: "#cf8e6d" },
  { tag: t.invalid, color: "#e06c75", textDecoration: "underline" },
]);

export const coreTermSyntaxHighlighting: Extension = syntaxHighlighting(coreTermHighlightStyle);
