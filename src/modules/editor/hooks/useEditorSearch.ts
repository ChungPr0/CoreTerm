import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  SearchQuery,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import {
  EDITOR_FIND_MAX_MATCHES,
  EDITOR_FIND_TIME_BUDGET_MS,
  EDITOR_SELECTION_SEED_MAX_LEN,
} from "@/shared/defaults";

interface UseEditorSearchOpts {
  viewRef: React.MutableRefObject<EditorView | null>;
  readonlyRef: React.MutableRefObject<boolean>;
  docVersion: number;
  onBeforeOpenFind: () => void;
}

export function useEditorSearch({
  viewRef,
  readonlyRef,
  docVersion,
  onBeforeOpenFind,
}: UseEditorSearchOpts) {
  const findInputRef = useRef<HTMLInputElement>(null);
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
  }, []);

  const computeFindStats = useCallback((view: EditorView, query: SearchQuery) => {
    if (!query.search) {
      setFindMatches({ index: 0, count: 0 });
      setInvalidRegex(false);
      return;
    }
    if (!query.valid) {
      setFindMatches({ index: 0, count: 0 });
      setInvalidRegex(true);
      return;
    }
    setInvalidRegex(false);
    const sel = view.state.selection.main;
    const cursor = query.getCursor(view.state.doc);
    let count = 0;
    let index = 0;
    const startMs = performance.now();

    // Time-budgeted loop prevents catastrophic regex backtracking (ReDoS) from freezing the UI thread.
    while (
      count < EDITOR_FIND_MAX_MATCHES &&
      performance.now() - startMs < EDITOR_FIND_TIME_BUDGET_MS
    ) {
      const step = cursor.next();
      if (step.done) break;
      count++;
      if (index === 0 && step.value.from >= sel.from) {
        index = count;
      }
    }
    if (count > 0 && index === 0) index = 1;
    setFindMatches({ index, count });
  }, []);

  const syncSearchQuery = useCallback(
    (view: EditorView) => {
      const q = new SearchQuery({
        search: findQuery,
        replace: replaceQuery,
        caseSensitive,
        wholeWord,
        regexp: regex,
      });
      view.dispatch({ effects: setSearchQuery.of(q) });
      computeFindStats(view, q);
      return q;
    },
    [caseSensitive, computeFindStats, findQuery, regex, replaceQuery, wholeWord]
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !findOpen) return;
    syncSearchQuery(view);
  }, [findOpen, syncSearchQuery, docVersion, viewRef]);

  const closeFindBar = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: "" })),
      });
      view.focus();
    }
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
    const q = syncSearchQuery(view);
    if (!q.valid) return;
    findNext(view);
    computeFindStats(view, q);
  }, [computeFindStats, findQuery, syncSearchQuery, viewRef]);

  const handleFindPrev = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery) return;
    const q = syncSearchQuery(view);
    if (!q.valid) return;
    findPrevious(view);
    computeFindStats(view, q);
  }, [computeFindStats, findQuery, syncSearchQuery, viewRef]);

  const handleReplaceNext = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery || readonlyRef.current) return;
    const q = syncSearchQuery(view);
    if (!q.valid) return;
    replaceNext(view);
    computeFindStats(view, q);
  }, [computeFindStats, findQuery, readonlyRef, syncSearchQuery, viewRef]);

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view || !findQuery || readonlyRef.current) return;
    const q = syncSearchQuery(view);
    if (!q.valid) return;
    replaceAll(view);
    computeFindStats(view, q);
  }, [computeFindStats, findQuery, readonlyRef, syncSearchQuery, viewRef]);

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
