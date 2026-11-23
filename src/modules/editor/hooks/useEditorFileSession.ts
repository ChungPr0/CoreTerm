import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { LOCAL_HOST_ID, SFTP_AUTH_BLOCKED_RE, SFTP_DISCONNECT_RE } from "@/shared/defaults";
import { useAutoReconnect } from "@/shared/hooks/useAutoReconnect";
import { useI18n } from "@/shared/i18n";
import type { EditorTabMeta, FileWriteResultDto, TerminalTabItem } from "@/shared/types/ipc";
import { useAlert } from "@/shared/ui";
import { extractRawErrorMessage, formatLocalizedError } from "@/shared/utils/formatError";
import { localFsApi, sftpApi } from "@/modules/sftp";
import { useTabsStore } from "@/modules/workspace";
import type { EditorCursorPos, EditorDiscardAction, EditorLineEnding } from "../types";
import {
  convertLineEnding,
  detectEditorLanguage,
  detectLineEnding,
  normalizeToLf,
} from "../utils/editorLanguage";

interface UseEditorFileSessionOpts {
  tab: TerminalTabItem;
  file: EditorTabMeta;
  viewRef: React.MutableRefObject<EditorView | null>;
  userReadonly: boolean;
  pauseAutoReconnect?: boolean;
  onUpdateDirty: (dirty: boolean) => void;
  onResetOverlays: () => void;
  onSetLangId: (langId: string) => void;
  onApplyLanguage: (langId: string) => void;
  onMountEditor: (lfDoc: string, isReadonly: boolean) => void;
  onDestroyEditor: () => void;
  onSetCursorPos: (pos: EditorCursorPos) => void;
  onSetTotalChars: (chars: number) => void;
  onSaved?: (res: FileWriteResultDto) => void;
}

export function useEditorFileSession({
  tab,
  file,
  viewRef,
  userReadonly,
  pauseAutoReconnect = false,
  onUpdateDirty,
  onResetOverlays,
  onSetLangId,
  onApplyLanguage,
  onMountEditor,
  onDestroyEditor,
  onSetCursorPos,
  onSetTotalChars,
  onSaved,
}: UseEditorFileSessionOpts) {
  const { t } = useI18n();
  const alert = useAlert();

  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrDisconnected, setLoadErrDisconnected] = useState(false);
  const [hasLoadedDoc, setHasLoadedDoc] = useState(false);
  const [fileReadonly, setFileReadonly] = useState(false);
  const [eol, setEol] = useState<EditorLineEnding>("LF");
  const [savedEol, setSavedEol] = useState<EditorLineEnding>("LF");
  const [confirmDiscard, setConfirmDiscard] = useState<EditorDiscardAction>(null);

  const isRemote = file.kind === "remote";
  const isRemoteConnecting = isRemote && (connecting || tab.state === "CONNECTING");
  const isRemoteOffline =
    isRemote &&
    !connecting &&
    (tab.state === "DISCONNECTED" || tab.state === "ERROR" || tab.state === "AUTH_FAILED");
  const isRemoteRetryableOffline =
    isRemote && !connecting && (tab.state === "DISCONNECTED" || tab.state === "ERROR");
  const isAutoReconnect = Boolean(
    isRemote &&
    tab.hostId !== LOCAL_HOST_ID &&
    tab.canAutoReconnect !== false &&
    tab.autoReconnect &&
    !authBlocked &&
    tab.state !== "AUTH_FAILED"
  );
  const effectiveReadonly = fileReadonly || userReadonly;

  const mountedRef = useRef(true);
  const savedDocRef = useRef<string>("");
  const savedEolRef = useRef<EditorLineEnding>("LF");
  const eolRef = useRef<EditorLineEnding>("LF");
  const savingRef = useRef(false);
  const readonlyRef = useRef(false);
  const userReadonlyRef = useRef(userReadonly);
  const hasLoadedRef = useRef(false);
  const loadErrorRef = useRef<string | null>(null);
  const lastErrRef = useRef<string | null>(null);
  const connectSeqRef = useRef(0);
  const connectingSeqRef = useRef(0);
  const loadSeqRef = useRef(0);
  const connectRef = useRef<(reloadAfter: boolean, isRetry?: boolean) => Promise<boolean>>(
    async () => false
  );
  const prevReconnectTokenRef = useRef(tab.reconnectToken);

  savingRef.current = saving;
  readonlyRef.current = effectiveReadonly;
  userReadonlyRef.current = userReadonly;
  hasLoadedRef.current = hasLoadedDoc;
  loadErrorRef.current = loadError;
  eolRef.current = eol;
  savedEolRef.current = savedEol;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isRemote) {
        void sftpApi.sftpDisconnect(tab.tabId).catch(() => {});
      }
    };
  }, [isRemote, tab.tabId]);

  useEffect(() => {
    if (!isRemote) return;
    let active = true;
    let unlisten: (() => void) | null = null;
    void sftpApi
      .onSftpStatus((ev) => {
        if (!active || ev.tab_id !== tab.tabId) return;
        if (
          connectingSeqRef.current !== 0 &&
          (ev.state === "ERROR" || ev.state === "DISCONNECTED")
        ) {
          return;
        }
        useTabsStore.getState().setSftpState(tab.tabId, ev.state);
      })
      .then((fn) => {
        if (!active) fn();
        else unlisten = fn;
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [isRemote, tab.tabId]);

  const loadFile = useCallback(
    async (isRetry = false) => {
      const seq = ++loadSeqRef.current;
      if (isRetry) {
        setRetrying(true);
      } else {
        setLoading(true);
        setLoadError(null);
        setLoadErrDisconnected(false);
      }
      setConfirmDiscard(null);
      onResetOverlays();
      onDestroyEditor();

      const detectedLang = detectEditorLanguage(file.name);
      onSetLangId(detectedLang.id);

      try {
        const dto = isRemote
          ? await sftpApi.sftpReadFile(tab.tabId, file.path)
          : await localFsApi.localReadFile(file.path);
        if (!mountedRef.current || seq !== loadSeqRef.current) return;

        const detectedEol = detectLineEnding(dto.content);
        const lfDoc = normalizeToLf(dto.content);
        savedDocRef.current = lfDoc;
        savedEolRef.current = detectedEol;
        eolRef.current = detectedEol;

        setEol(detectedEol);
        setSavedEol(detectedEol);
        setFileReadonly(dto.readonly);
        setHasLoadedDoc(true);
        setLoadError(null);
        setLoadErrDisconnected(false);
        onUpdateDirty(false);
        onSetCursorPos({ line: 1, col: 1, selLen: 0 });
        onSetTotalChars(lfDoc.length);
        setLoading(false);
        setRetrying(false);

        window.requestAnimationFrame(() => {
          if (!mountedRef.current || seq !== loadSeqRef.current) return;
          onMountEditor(lfDoc, dto.readonly || userReadonlyRef.current);
          onApplyLanguage(detectedLang.id);
        });
      } catch (err) {
        if (!mountedRef.current || seq !== loadSeqRef.current) return;
        const raw = extractRawErrorMessage(err);
        const disconnectedErr = isRemote && SFTP_DISCONNECT_RE.test(raw);
        if (disconnectedErr) {
          useTabsStore.getState().setSftpState(tab.tabId, "DISCONNECTED");
        }
        setLoading(false);
        setRetrying(false);
        setHasLoadedDoc(false);
        setLoadErrDisconnected(disconnectedErr);
        setLoadError(formatLocalizedError(err, t));
      }
    },
    [
      file.name,
      file.path,
      isRemote,
      onApplyLanguage,
      onDestroyEditor,
      onMountEditor,
      onResetOverlays,
      onSetCursorPos,
      onSetLangId,
      onSetTotalChars,
      onUpdateDirty,
      t,
      tab.tabId,
    ]
  );

  const connectSftp = useCallback(
    async (reloadAfter: boolean, isRetry = false): Promise<boolean> => {
      if (!isRemote || tab.hostId === LOCAL_HOST_ID) return false;
      const seq = ++connectSeqRef.current;
      connectingSeqRef.current = seq;
      const isStale = () => !mountedRef.current || connectSeqRef.current !== seq;

      setConnecting(true);
      if (!hasLoadedRef.current && !isRetry) {
        setLoading(true);
        setLoadError(null);
      }
      useTabsStore.getState().setSftpState(tab.tabId, "CONNECTING");

      try {
        await sftpApi.sftpConnect(tab.tabId, tab.hostId);
        if (isStale()) return false;

        setAuthBlocked(false);
        lastErrRef.current = null;
        setConnecting(false);
        useTabsStore.getState().setSftpState(tab.tabId, "CONNECTED");
        if (reloadAfter || !hasLoadedRef.current) {
          await loadFile(isRetry);
        }
        return true;
      } catch (err) {
        if (isStale()) return false;
        const rawMsg = extractRawErrorMessage(err);
        if (SFTP_AUTH_BLOCKED_RE.test(rawMsg)) {
          setAuthBlocked(true);
        }
        setConnecting(false);
        setLoading(false);
        setRetrying(false);
        useTabsStore.getState().setSftpState(tab.tabId, "ERROR");
        const localized = formatLocalizedError(err, t);
        if (!hasLoadedRef.current) {
          setLoadError(localized);
          setLoadErrDisconnected(true);
        } else if (!rawMsg || lastErrRef.current !== rawMsg) {
          lastErrRef.current = rawMsg || "ERROR";
          alert.error(localized);
        }
        return false;
      } finally {
        if (connectingSeqRef.current === seq) {
          connectingSeqRef.current = 0;
        }
      }
    },
    [alert, isRemote, loadFile, t, tab.hostId, tab.tabId]
  );

  connectRef.current = connectSftp;

  useEffect(() => {
    setAuthBlocked(false);
    lastErrRef.current = null;
    const timer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      if (isRemote) void connectRef.current(true);
      else void loadFile();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      connectSeqRef.current += 1;
      loadSeqRef.current += 1;
      onDestroyEditor();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.kind, file.path]);

  useEffect(() => {
    if (tab.reconnectToken > prevReconnectTokenRef.current) {
      prevReconnectTokenRef.current = tab.reconnectToken;
      if (isRemote) {
        if (tab.reconnectSource !== "auto") {
          setAuthBlocked(false);
          lastErrRef.current = null;
        }
        void connectRef.current(!hasLoadedRef.current, Boolean(loadErrorRef.current));
      }
    }
  }, [isRemote, tab.reconnectToken, tab.reconnectSource]);

  useAutoReconnect({
    enabled: isAutoReconnect,
    connected: isRemote && !connecting && tab.state === "ONLINE",
    disconnected: isRemoteRetryableOffline,
    paused: pauseAutoReconnect,
    intervalSec: tab.reconnectIntervalSec,
    onReconnect: () => {
      useTabsStore.getState().bumpReconnectToken(tab.tabId, "auto");
    },
  });

  const manualReconnect = useCallback(
    (source: "tab" | "banner" = "banner") => {
      if (!isRemote || tab.hostId === LOCAL_HOST_ID) return;
      setAuthBlocked(false);
      lastErrRef.current = null;
      useTabsStore.getState().bumpReconnectToken(tab.tabId, source);
    },
    [isRemote, tab.hostId, tab.tabId]
  );

  const reconnectAndReload = useCallback(
    (isRetry = false) => {
      if (!isRemote || tab.hostId === LOCAL_HOST_ID) return;
      setAuthBlocked(false);
      lastErrRef.current = null;
      void connectSftp(true, isRetry);
    },
    [connectSftp, isRemote, tab.hostId]
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!viewRef.current || savingRef.current || readonlyRef.current) return false;
    const lfDoc = viewRef.current.state.doc.toString();
    const payload = convertLineEnding(lfDoc, eolRef.current);

    setSaving(true);
    try {
      const res = isRemote
        ? await sftpApi.sftpWriteFile(tab.tabId, file.path, payload)
        : await localFsApi.localWriteFile(file.path, payload);

      savedDocRef.current = lfDoc;
      savedEolRef.current = eolRef.current;
      setSavedEol(eolRef.current);
      onUpdateDirty(false);
      onSaved?.(res);
      return true;
    } catch (err) {
      if (isRemote && SFTP_DISCONNECT_RE.test(extractRawErrorMessage(err))) {
        useTabsStore.getState().setSftpState(tab.tabId, "DISCONNECTED");
      }
      alert.error(formatLocalizedError(err, t));
      return false;
    } finally {
      setSaving(false);
    }
  }, [alert, file.path, isRemote, onSaved, onUpdateDirty, t, tab.tabId, viewRef]);

  const toggleEol = useCallback(() => {
    if (effectiveReadonly || loading) return;
    const next: EditorLineEnding = eol === "LF" ? "CRLF" : "LF";
    eolRef.current = next;
    setEol(next);
    const currentDoc = viewRef.current?.state.doc.toString() ?? savedDocRef.current;
    const dirty = currentDoc !== savedDocRef.current || next !== savedEolRef.current;
    onUpdateDirty(dirty);
  }, [effectiveReadonly, eol, loading, onUpdateDirty, viewRef]);

  return {
    loading,
    retrying,
    connecting,
    authBlocked,
    saving,
    loadError,
    loadErrDisconnected,
    hasLoadedDoc,
    fileReadonly,
    effectiveReadonly,
    isRemote,
    isRemoteConnecting,
    isRemoteOffline,
    isAutoReconnect,
    eol,
    confirmDiscard,
    setConfirmDiscard,
    savedDocRef,
    savedEolRef,
    eolRef,
    savingRef,
    readonlyRef,
    hasLoadedRef,
    loadFile,
    connectSftp,
    manualReconnect,
    reconnectAndReload,
    handleSave,
    toggleEol,
  };
}
