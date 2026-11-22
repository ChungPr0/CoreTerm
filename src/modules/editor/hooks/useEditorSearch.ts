import { useCallback, useEffect, useRef, useState } from "react";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  SearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import {
  EDITOR_FIND_MAX_MATCHES,
  EDITOR_FIND_TIME_BUDGET_MS,
  EDITOR_SELECTION_SEED_MAX_LEN,
} from "@/shared/defaults";
import type { EditorCursorPos } from "../types";

interface UseEditorSearchOpts {
  viewRef: React.MutableRefObject<EditorView | null>;
  readonlyRef: React.MutableRefObject<boolean>;
  docVersion: number;
  cursorPos?: EditorCursorPos;
  onBeforeOpenFind: () => void;
}

export function useEditorSearch({
  viewRef,
  readonlyRef,
  docVersion,
  cursorPos,
  onBeforeOpenFind,
}: UseEditorSearchOpts) {
  const findInputRef = useRef<HTMLInputElement>(null);
  const matchesRef = useRef<Array<{ from: number; to: number }>>([]);
  const currentMatchIdxRef = useRef<number>(-1);
  const [findOpen, setFindOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [invalidRegex, setInvalidRegex] = useState(false);
  const [findMatches, setFindMatches] = useState({ index: 0, count: 0 });

  const resetSearchState = useCallback(() => {
    setFindOpen(false);
    setShowReplace(false);
    matchesRef.current = [];
    currentMatchIdxRef.current = -1;
    setFindMatches({ index: 0, count: 0 });
  }, []);

  const updateMatchIndex = useCallback((view: EditorView) => {
    const matches = matchesRef.current;
    if (matches.length === 0) {
      currentMatchIdxRef.current = -1;
      setFindMatches({ index: 0, count: 0 });
      return;
    }
    const sel = view.state.selection.main;
    let idx = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
    if (idx === -1) {
      idx = matches.findIndex((m) => m.from >= sel.from);
      if (idx === -1) idx = 0;
    }
    currentMatchIdxRef.current = idx;
    setFindMatches({ index: idx + 1, count: matches.length });
  }, []);

  const jumpToMatch = useCallback(
    (view: EditorView, matchIndex: number) => {
      const matches = matchesRef.current;
      if (matches.length === 0) return;
      const clampedIndex = ((matchIndex % matches.length) + matches.length) % matches.length;
      const target = matches[clampedIndex];
      if (!target) return;

      currentMatchIdxRef.current = clampedIndex;
      view.dispatch({
        selection: EditorSelection.single(target.from, target.to),
        effects: [EditorView.scrollIntoView(target.from, { y: "center" })],
        userEvent: "select.search",
      });
      setFindMatches({ index: clampedIndex + 1, count: matches.length });
    },
    []
  );

  const syncSearchQuery = useCallback(
    (view: EditorView): Array<{ from: number; to: number }> => {
      if (!findQuery) {
        matchesRef.current = [];
        currentMatchIdxRef.current = -1;
        setFindMatches({ index: 0, count: 0 });
        setInvalidRegex(false);
        view.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: "" })),
        });
        return [];
      }

      const q = new SearchQuery({
        search: findQuery,
        replace: replaceQuery,
        caseSensitive,
        wholeWord,
        regexp: regex,
      });

      if (!q.valid) {
        matchesRef.current = [];
        currentMatchIdxRef.current = -1;
        setFindMatches({ index: 0, count: 0 });
        setInvalidRegex(true);
        return [];
      }

      setInvalidRegex(false);
      view.dispatch({ effects: setSearchQuery.of(q) });

      const cursor = q.getCursor(view.state) as {
        next: () => { value?: { from: number; to: number }; done?: boolean };
        value?: { from: number; to: number };
        done?: boolean;
      };
      const collected: Array<{ from: number; to: number }> = [];
      const startMs = performance.now();

      while (collected.length < EDITOR_FIND_MAX_MATCHES) {
        if (regex && performance.now() - startMs > EDITOR_FIND_TIME_BUDGET_MS) {
          setInvalidRegex(true);
          matchesRef.current = [];
          currentMatchIdxRef.current = -1;
          setFindMatches({ index: 0, count: 0 });
          return [];
        }
        const step = cursor.next();
        if (step.done || !step.value) break;
        collected.push({ from: step.value.from, to: step.value.to });
      }
      matchesRef.current = collected;

      if (collected.length === 0) {
        currentMatchIdxRef.current = -1;
        setFindMatches({ index: 0, count: 0 });
        return collected;
      }

      const sel = view.state.selection.main;
      let idx = collected.findIndex((m) => m.from === sel.from && m.to === sel.to);
      if (idx === -1) {
        idx = collected.findIndex((m) => m.from >= sel.from);
        if (idx === -1) idx = 0;
      }
      currentMatchIdxRef.current = idx;
      setFindMatches({ index: idx + 1, count: collected.length });
      return collected;
    },
    [caseSensitive, findQuery, regex, replaceQuery, wholeWord]
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !findOpen) return;
    syncSearchQuery(view);
  }, [findOpen, syncSearchQuery, docVersion, viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !findOpen) return;
    updateMatchIndex(view);
  }, [cursorPos, findOpen, updateMatchIndex, viewRef]);

  const closeFindBar = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: "" })),
      });
      view.focus();
    }
    matchesRef.current = [];
    currentMatchIdxRef.current = -1;
    setFindMatches({ index: 0, count: 0 });
    setFindOpen(false);
  }, [viewRef]);

  const openFindBar = useCallback(
    (withReplace: boolean) => {
      onBeforeOpenFind();
      const view = viewRef.current;
      if (view) {
        const sel = view.state.selection.main;
        if (!sel.empty && sel.to - sel.from <= EDITOR_SELECTION_SEED_MAX_LEN) {
          const selected = view.state.sliceDoc(sel.from, sel.to);
          if (!selected.includes("\n")) {
            setFindQuery(selected);
          }
        }
      }
      setFindOpen(true);
      if (withReplace) setShowReplace(true);
      window.setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 10);
    },
    [onBeforeOpenFind, viewRef]
  );

  const handleFindNext = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery) return;
    let matches = matchesRef.current;
    if (matches.length === 0) {
      matches = syncSearchQuery(view);
      if (matches.length === 0) return;
    }

    const sel = view.state.selection.main;
    const curIdx = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
    let nextIdx: number;
    if (curIdx !== -1) {
      nextIdx = (curIdx + 1) % matches.length;
    } else {
      const cur = currentMatchIdxRef.current;
      if (cur !== -1 && cur < matches.length) {
        nextIdx = (cur + 1) % matches.length;
      } else {
        const after = matches.findIndex((m) => m.from >= sel.from);
        nextIdx = after !== -1 ? after : 0;
      }
    }
    jumpToMatch(view, nextIdx);
  }, [findQuery, jumpToMatch, syncSearchQuery, viewRef]);

  const handleFindPrev = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery) return;
    let matches = matchesRef.current;
    if (matches.length === 0) {
      matches = syncSearchQuery(view);
      if (matches.length === 0) return;
    }

    const sel = view.state.selection.main;
    const curIdx = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
    let prevIdx: number;
    if (curIdx !== -1) {
      prevIdx = (curIdx - 1 + matches.length) % matches.length;
    } else {
      const cur = currentMatchIdxRef.current;
      if (cur !== -1 && cur < matches.length) {
        prevIdx = (cur - 1 + matches.length) % matches.length;
      } else {
        let before = -1;
        for (let i = matches.length - 1; i >= 0; i--) {
          if (matches[i].to <= sel.from) {
            before = i;
            break;
          }
        }
        prevIdx = before !== -1 ? before : matches.length - 1;
      }
    }
    jumpToMatch(view, prevIdx);
  }, [findQuery, jumpToMatch, syncSearchQuery, viewRef]);

  const handleReplaceNext = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery || readonlyRef.current) return;
    replaceNext(view);
    syncSearchQuery(view);
  }, [findQuery, readonlyRef, syncSearchQuery, viewRef]);

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery || readonlyRef.current) return;
    replaceAll(view);
    syncSearchQuery(view);
  }, [findQuery, readonlyRef, syncSearchQuery, viewRef]);

  return {
    findInputRef,
    findOpen,
    showReplace,
    setShowReplace,
    findQuery,
    setFindQuery,
    replaceQuery,
    setReplaceQuery,
    caseSensitive,
    setCaseSensitive,
    wholeWord,
    setWholeWord,
    regex,
    setRegex,
    invalidRegex,
    findMatches,
    resetSearchState,
    openFindBar,
    closeFindBar,
    handleFindNext,
    handleFindPrev,
    handleReplaceNext,
    handleReplaceAll,
  };
}
