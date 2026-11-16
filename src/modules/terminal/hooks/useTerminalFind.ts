import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";

const FIND_DECORATIONS: NonNullable<ISearchOptions["decorations"]> = {
  matchBackground: "#1e3a5f",
  matchBorder: "#38bdf8",
  matchOverviewRuler: "#38bdf8",
  activeMatchBackground: "#b45309",
  activeMatchBorder: "#f59e0b",
  activeMatchColorOverviewRuler: "#f59e0b",
};

interface UseTerminalFindOpts {
  terminalRef: React.MutableRefObject<Terminal | null>;
  searchAddonRef: React.MutableRefObject<SearchAddon | null>;
  isActive: boolean;
  findToken: number;
}

export function useTerminalFind({
  terminalRef,
  searchAddonRef,
  isActive,
  findToken,
}: UseTerminalFindOpts) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [invalidRegex, setInvalidRegex] = useState(false);
  const [matches, setMatches] = useState<{ index: number; count: number }>({
    index: 0,
    count: 0,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const lastTokenRef = useRef(findToken);

  const focusInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  useEffect(() => {
    const addon = searchAddonRef.current;
    if (!addon) return;
    const disp = addon.onDidChangeResults((res) => {
      setMatches({
        index: res.resultIndex >= 0 ? res.resultIndex + 1 : 0,
        count: res.resultCount,
      });
    });
    return () => disp.dispose();
  }, [searchAddonRef, isOpen]);

  useEffect(() => {
    if (findToken === 0 || findToken === lastTokenRef.current) return;
    lastTokenRef.current = findToken;

    const sel = terminalRef.current?.getSelection()?.trim() ?? "";
    if (sel && !sel.includes("\n") && sel.length <= 120) {
      setQuery(sel);
    }
    setIsOpen(true);
    focusInput();
  }, [findToken, focusInput, terminalRef]);

  useEffect(() => {
    if (isOpen && isActive) {
      focusInput();
    }
  }, [isOpen, isActive, focusInput]);

  useEffect(() => {
    const addon = searchAddonRef.current;
    if (!isOpen || !addon) return;
    if (!query) {
      setInvalidRegex(false);
      setMatches({ index: 0, count: 0 });
      addon.clearDecorations();
      terminalRef.current?.clearSelection();
      return;
    }
    try {
      addon.findNext(query, {
        caseSensitive,
        regex,
        incremental: true,
        decorations: FIND_DECORATIONS,
      });
      setInvalidRegex(false);
    } catch {
      setInvalidRegex(true);
      setMatches({ index: 0, count: 0 });
      addon.clearDecorations();
    }
  }, [isOpen, query, caseSensitive, regex, searchAddonRef, terminalRef]);

  const stepMatch = useCallback(
    (direction: "next" | "prev") => {
      const addon = searchAddonRef.current;
      if (!addon || !query) return;
      try {
        const opts: ISearchOptions = {
          caseSensitive,
          regex,
          decorations: FIND_DECORATIONS,
        };
        if (direction === "next") addon.findNext(query, opts);
        else addon.findPrevious(query, opts);
        setInvalidRegex(false);
      } catch {
        setInvalidRegex(true);
      }
    },
    [query, caseSensitive, regex, searchAddonRef]
  );

  const closeFind = useCallback(() => {
    setIsOpen(false);
    setInvalidRegex(false);
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.clearSelection();
    terminalRef.current?.focus();
  }, [searchAddonRef, terminalRef]);

  return {
    isOpen,
    inputRef,
    query,
    setQuery,
    caseSensitive,
    toggleCaseSensitive: () => setCaseSensitive((v) => !v),
    regex,
    toggleRegex: () => setRegex((v) => !v),
    invalidRegex,
    matches,
    findNext: () => stepMatch("next"),
    findPrev: () => stepMatch("prev"),
    closeFind,
  };
}
