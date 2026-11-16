import { useCallback, useEffect, useRef, useState } from "react";
import type { FileItem } from "../types";
import { type DirHistory, EMPTY_HISTORY, pushDirHistory } from "./fileListUtils";

interface UseDirectoryBrowserOptions {
  defaultHome?: string;
  fetchDir: (path: string) => Promise<{ path: string; items: FileItem[] }>;
  parentPath: (cwd: string) => string;
  onError: (err: unknown) => void;
}

export function useDirectoryBrowser({
  defaultHome = "",
  fetchDir,
  parentPath,
  onError,
}: UseDirectoryBrowserOptions) {
  const [cwd, setCwd] = useState("");
  const [homeDir, setHomeDirState] = useState(defaultHome);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState<DirHistory>(EMPTY_HISTORY);

  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  const cwdRef = useRef(cwd);
  const homeRef = useRef(homeDir);
  const historyRef = useRef(history);
  const fetchDirRef = useRef(fetchDir);
  const parentPathRef = useRef(parentPath);
  const onErrorRef = useRef(onError);

  cwdRef.current = cwd;
  homeRef.current = homeDir;
  historyRef.current = history;
  fetchDirRef.current = fetchDir;
  parentPathRef.current = parentPath;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setHomeDir = useCallback((path: string) => {
    homeRef.current = path;
    setHomeDirState(path);
  }, []);

  const loadDir = useCallback(
    async (path: string, isStaleFn?: () => boolean, recordHistory = true) => {
      if (!path) return;
      const seq = ++loadSeqRef.current;
      setLoading(true);
      try {
        const res = await fetchDirRef.current(path);
        if (loadSeqRef.current !== seq || isStaleFn?.() || !mountedRef.current) return;
        cwdRef.current = res.path;
        setCwd(res.path);
        setItems(res.items);
        setSelected([]);
        if (recordHistory) {
          setHistory((prev) => {
            const next = pushDirHistory(prev, res.path);
            historyRef.current = next;
            return next;
          });
        }
      } catch (err) {
        if (loadSeqRef.current !== seq || isStaleFn?.() || !mountedRef.current) return;
        onErrorRef.current(err);
      } finally {
        if (mountedRef.current && loadSeqRef.current === seq) {
          setLoading(false);
        }
      }
    },
    []
  );

  const goHistory = useCallback(
    (delta: -1 | 1) => {
      const h = historyRef.current;
      const nextIdx = h.index + delta;
      if (nextIdx < 0 || nextIdx >= h.entries.length) return;
      const target = h.entries[nextIdx];
      if (!target) return;
      const nextHistory = { ...h, index: nextIdx };
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      void loadDir(target, undefined, false);
    },
    [loadDir]
  );

  const goUp = useCallback(() => {
    const cur = cwdRef.current;
    if (cur) void loadDir(parentPathRef.current(cur));
  }, [loadDir]);

  const goHome = useCallback(() => {
    const home = homeRef.current;
    if (home) void loadDir(home);
  }, [loadDir]);

  const refresh = useCallback(() => {
    const cur = cwdRef.current;
    if (cur) void loadDir(cur, undefined, false);
  }, [loadDir]);

  return {
    cwd,
    cwdRef,
    homeDir,
    homeRef,
    setHomeDir,
    items,
    loading,
    selected,
    setSelected,
    filter,
    setFilter,
    history,
    canGoBack: history.index > 0,
    canGoForward: history.index >= 0 && history.index < history.entries.length - 1,
    loadDir,
    goHistory,
    goUp,
    goHome,
    refresh,
  };
}

export type DirectoryBrowser = ReturnType<typeof useDirectoryBrowser>;
