import { useCallback, useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  insertTab,
} from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { EDITOR_FONT_SIZE_DEFAULT } from "@/shared/defaults";
import type { EditorCursorPos, EditorLineEnding } from "../types";
import { getEditorLanguageById } from "../utils/editorLanguage";
import { coreTermSyntaxHighlighting, createCoreTermEditorTheme } from "../utils/editorTheme";

interface UseCodeMirrorViewOpts {
  wordWrap: boolean;
  effectiveReadonly: boolean;
  fontSize: number;
  savedDocRef: React.MutableRefObject<string>;
  savedEolRef: React.MutableRefObject<EditorLineEnding>;
  eolRef: React.MutableRefObject<EditorLineEnding>;
  saveFnRef: React.MutableRefObject<() => Promise<boolean>>;
  openFindRef: React.MutableRefObject<(withReplace: boolean) => void>;
  openGotoRef: React.MutableRefObject<() => void>;
  findNextRef?: React.MutableRefObject<() => void>;
  findPrevRef?: React.MutableRefObject<() => void>;
  findOpenRef?: React.MutableRefObject<boolean>;
  onUpdateDirty: (dirty: boolean) => void;
}

export function useCodeMirrorView({
  wordWrap,
  effectiveReadonly,
  fontSize,
  savedDocRef,
  savedEolRef,
  eolRef,
  saveFnRef,
  openFindRef,
  openGotoRef,
  findNextRef,
  findPrevRef,
  findOpenRef,
  onUpdateDirty,
}: UseCodeMirrorViewOpts) {
  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartmentRef = useRef(new Compartment());
  const wrapCompartmentRef = useRef(new Compartment());
  const readonlyCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());
  const langSeqRef = useRef(0);

  const wordWrapRef = useRef(wordWrap);
  const fontSizeRef = useRef(fontSize || EDITOR_FONT_SIZE_DEFAULT);
  const effectiveReadonlyRef = useRef(effectiveReadonly);
  wordWrapRef.current = wordWrap;
  fontSizeRef.current = fontSize;
  effectiveReadonlyRef.current = effectiveReadonly;

  const [langId, setLangId] = useState("plain");
  const [totalLines, setTotalLines] = useState<number>(1);
  const [totalChars, setTotalChars] = useState<number>(0);
  const [cursorPos, setCursorPos] = useState<EditorCursorPos>({ line: 1, col: 1, selLen: 0 });
  const [docVersion, setDocVersion] = useState(0);

  const destroyEditor = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
  }, []);

  const applyLanguage = useCallback((nextLangId: string) => {
    setLangId(nextLangId);
    const seq = ++langSeqRef.current;
    const spec = getEditorLanguageById(nextLangId);
    void spec.loadExtension().then((ext) => {
      if (seq !== langSeqRef.current || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: langCompartmentRef.current.reconfigure(ext ?? []),
      });
    });
  }, []);

  const mountEditor = useCallback(
    (initialLfDoc: string, isReadonly: boolean) => {
      destroyEditor();
      const host = editorHostRef.current;
      if (!host) return;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentDoc = update.state.doc.toString();
          const dirty =
            currentDoc !== savedDocRef.current || eolRef.current !== savedEolRef.current;
          onUpdateDirty(dirty);
          setTotalLines(update.state.doc.lines);
          setTotalChars(update.state.doc.length);
          setDocVersion((v) => v + 1);
        }
        if (update.selectionSet || update.docChanged) {
          const sel = update.state.selection.main;
          const line = update.state.doc.lineAt(sel.head);
          setCursorPos({
            line: line.number,
            col: sel.head - line.from + 1,
            selLen: Math.abs(sel.to - sel.from),
          });
        }
      });

      const state = EditorState.create({
        doc: initialLfDoc,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          foldGutter(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          search(),
          coreTermSyntaxHighlighting,
          themeCompartmentRef.current.of(createCoreTermEditorTheme(fontSizeRef.current)),
          langCompartmentRef.current.of([]),
          wrapCompartmentRef.current.of(wordWrapRef.current ? EditorView.lineWrapping : []),
          readonlyCompartmentRef.current.of(EditorState.readOnly.of(isReadonly)),
          EditorView.domEventHandlers({
            mousedown: (event, view) => {
              if (event.button === 2) {
                const sel = view.state.selection.main;
                if (!sel.empty) {
                  // Prevent browser contenteditable from collapsing active selection on right-click
                  event.preventDefault();
                  return true;
                }
              }
              return false;
            },
          }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                void saveFnRef.current();
                return true;
              },
            },
            {
              key: "Mod-f",
              preventDefault: true,
              run: () => {
                openFindRef.current(false);
                return true;
              },
            },
            {
              key: "Mod-h",
              preventDefault: true,
              run: () => {
                openFindRef.current(true);
                return true;
              },
            },
            {
              key: "Mod-g",
              preventDefault: true,
              run: () => {
                openGotoRef.current();
                return true;
              },
            },
            {
              key: "F3",
              preventDefault: true,
              run: () => {
                findNextRef?.current?.();
                return true;
              },
            },
            {
              key: "Shift-F3",
              preventDefault: true,
              run: () => {
                findPrevRef?.current?.();
                return true;
              },
            },
            {
              key: "Enter",
              run: () => {
                if (findOpenRef?.current && effectiveReadonlyRef.current) {
                  findNextRef?.current?.();
                  return true;
                }
                return false;
              },
            },
            {
              key: "Shift-Enter",
              run: () => {
                if (findOpenRef?.current && effectiveReadonlyRef.current) {
                  findPrevRef?.current?.();
                  return true;
                }
                return false;
              },
            },
            {
              key: "Tab",
              preventDefault: true,
              run: (view) => {
                const hasMultiLineSelection = view.state.selection.ranges.some((range) => {
                  if (range.empty) return false;
                  const startLine = view.state.doc.lineAt(range.from).number;
                  const endLine = view.state.doc.lineAt(range.to).number;
                  return endLine > startLine;
                });
                return hasMultiLineSelection ? indentMore(view) : insertTab(view);
              },
            },
            {
              key: "Shift-Tab",
              preventDefault: true,
              run: indentLess,
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          updateListener,
        ],
      });

      const view = new EditorView({ state, parent: host });
      viewRef.current = view;
      setTotalLines(view.state.doc.lines);
      setTotalChars(view.state.doc.length);
      view.focus();
    },
    [destroyEditor, eolRef, onUpdateDirty, openFindRef, openGotoRef, saveFnRef, savedDocRef, savedEolRef]
  );

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(
        wordWrap ? EditorView.lineWrapping : []
      ),
    });
  }, [wordWrap]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: readonlyCompartmentRef.current.reconfigure(
        EditorState.readOnly.of(effectiveReadonly)
      ),
    });
  }, [effectiveReadonly]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(createCoreTermEditorTheme(fontSize)),
    });
  }, [fontSize]);

  return {
    editorHostRef,
    viewRef,
    langId,
    setLangId,
    totalLines,
    totalChars,
    setTotalChars,
    cursorPos,
    setCursorPos,
    docVersion,
    applyLanguage,
    mountEditor,
    destroyEditor,
  };
}
