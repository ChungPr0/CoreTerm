import React, { useCallback, useEffect, useRef, useState } from "react";
import { selectAll } from "@codemirror/commands";
import { RefreshCw } from "lucide-react";
import {
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  TOAST_COPY_MS,
} from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { FindBar, ReconnectBanner, useAlert } from "@/shared/ui";
import { copyText, readText } from "@/shared/utils/clipboard";
import { getEditableInput } from "@/shared/utils/editableTarget";
import {
  shouldPreventRightClickSelectionCollapse,
  useCodeMirrorView,
} from "../hooks/useCodeMirrorView";
import { useEditorFileSession } from "../hooks/useEditorFileSession";
import { useEditorSearch } from "../hooks/useEditorSearch";
import {
  buildEditorBannerMenu,
  buildEditorContextItems,
  buildEditorStatusBarMenu,
  buildEditorToolbarMenu,
} from "../menus/editorMenus";
import type { EditorLineEnding, FileEditorPaneProps } from "../types";
import { EditorDiscardModal } from "./EditorDiscardModal";
import { EditorGotoLineModal } from "./EditorGotoLineModal";
import { EditorLoadErrorView } from "./EditorLoadErrorView";
import { EditorStatusBar } from "./EditorStatusBar";
import { EditorToolbar } from "./EditorToolbar";

export const FileEditorPane: React.FC<FileEditorPaneProps> = ({
  tab,
  file,
  isActive,
  hasBlockingModal = false,
  hasTopLevelModal = false,
  pauseAutoReconnect = false,
  findToken = 0,
  closeRequestToken = 0,
  onDirtyChange,
  onForceClose,
  onShowMenu,
  onModalChange,
  onSaved,
  onOpenSettings,
  onOpenSshTab,
  onOpenSftpTab,
}) => {
  const { t } = useI18n();
  const alert = useAlert();

  const [fileReadonly, setFileReadonly] = useState(false);
  const [userReadonly, setUserReadonly] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [fontSize, setFontSize] = useState(EDITOR_FONT_SIZE_DEFAULT);
  const [isDirty, setIsDirty] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);

  const effectiveReadonly = fileReadonly || userReadonly;
  const isDirtyRef = useRef(false);
  const readonlyRef = useRef(effectiveReadonly);
  const saveFnRef = useRef<() => Promise<boolean>>(async () => false);
  const openFindRef = useRef<(withReplace: boolean) => void>(() => {});
  const openGotoRef = useRef<() => void>(() => {});
  const closeFindRef = useRef<() => void>(() => {});
  const findNextRef = useRef<() => void>(() => {});
  const findPrevRef = useRef<() => void>(() => {});
  const findOpenRef = useRef<boolean>(false);
  const savedDocInitRef = useRef("");
  const savedEolInitRef = useRef<EditorLineEnding>("LF");
  const eolInitRef = useRef<EditorLineEnding>("LF");
  const prevFindTokenRef = useRef(findToken);
  const prevCloseTokenRef = useRef(closeRequestToken);

  isDirtyRef.current = isDirty;
  readonlyRef.current = effectiveReadonly;

  const updateDirty = useCallback(
    (next: boolean) => {
      setIsDirty(next);
      onDirtyChange(next);
    },
    [onDirtyChange]
  );

  const cm = useCodeMirrorView({
    wordWrap,
    effectiveReadonly,
    fontSize,
    savedDocRef: savedDocInitRef,
    savedEolRef: savedEolInitRef,
    eolRef: eolInitRef,
    saveFnRef,
    openFindRef,
    openGotoRef,
    findNextRef,
    findPrevRef,
    findOpenRef,
    onUpdateDirty: updateDirty,
  });

  const handleBeforeOpenFind = useCallback(() => setGotoOpen(false), []);

  const search = useEditorSearch({
    viewRef: cm.viewRef,
    readonlyRef,
    docVersion: cm.docVersion,
    cursorPos: cm.cursorPos,
    onBeforeOpenFind: handleBeforeOpenFind,
  });

  const handleResetOverlays = useCallback(() => {
    search.resetSearchState();
    setGotoOpen(false);
  }, [search]);

  const session = useEditorFileSession({
    tab,
    file,
    viewRef: cm.viewRef,
    fileReadonly,
    userReadonly,
    pauseAutoReconnect,
    onSetFileReadonly: setFileReadonly,
    onUpdateDirty: updateDirty,
    onResetOverlays: handleResetOverlays,
    onSetLangId: cm.setLangId,
    onApplyLanguage: cm.applyLanguage,
    onMountEditor: cm.mountEditor,
    onDestroyEditor: cm.destroyEditor,
    onSetCursorPos: cm.setCursorPos,
    onSetTotalChars: cm.setTotalChars,
    onSaved,
  });

  savedDocInitRef.current = session.savedDocRef.current;
  savedEolInitRef.current = session.savedEolRef.current;
  eolInitRef.current = session.eolRef.current;
  saveFnRef.current = session.handleSave;

  const editorReady = !session.loading && !session.loadError;
  const hasLoadErrorModal = !session.loading && Boolean(session.loadError);

  const openGotoBar = useCallback(() => {
    if (search.findOpen) search.closeFindBar();
    setGotoOpen(true);
  }, [search]);

  openFindRef.current = search.openFindBar;
  openGotoRef.current = openGotoBar;
  closeFindRef.current = search.closeFindBar;
  findNextRef.current = search.handleFindNext;
  findPrevRef.current = search.handleFindPrev;
  findOpenRef.current = search.findOpen;

  const hasEditorModal =
    isActive && (gotoOpen || session.confirmDiscard !== null || hasLoadErrorModal);
  useEffect(() => {
    onModalChange?.(tab.tabId, hasEditorModal);
    return () => {
      onModalChange?.(tab.tabId, false);
    };
  }, [hasEditorModal, onModalChange, tab.tabId]);

  useEffect(() => {
    if (isActive && cm.viewRef.current && !search.findOpen && !gotoOpen && !session.confirmDiscard) {
      window.requestAnimationFrame(() => cm.viewRef.current?.focus());
    }
  }, [cm.viewRef, gotoOpen, isActive, search.findOpen, session.confirmDiscard]);

  useEffect(() => {
    if (findToken > prevFindTokenRef.current) {
      prevFindTokenRef.current = findToken;
      search.openFindBar(false);
    }
  }, [findToken, search]);

  useEffect(() => {
    if (closeRequestToken > prevCloseTokenRef.current) {
      prevCloseTokenRef.current = closeRequestToken;
      if (isDirtyRef.current) {
        session.setConfirmDiscard("close");
      } else {
        onForceClose();
      }
    }
  }, [closeRequestToken, onForceClose, session]);

  const requestReload = useCallback(() => {
    if (session.savingRef.current || session.loading || session.retrying || session.connecting) return;
    if (isDirtyRef.current) {
      session.setConfirmDiscard("reload");
      return;
    }
    if (session.isRemote && session.isRemoteOffline) {
      session.reconnectAndReload(false);
      return;
    }
    void session.loadFile();
  }, [session]);

  const adjustFontSize = useCallback((delta: number) => {
    setFontSize((prev) =>
      Math.max(EDITOR_FONT_SIZE_MIN, Math.min(EDITOR_FONT_SIZE_MAX, prev + delta))
    );
  }, []);

  const handleCopyPath = useCallback(() => {
    void copyText(file.path).then(() => alert.info(t("sftp.copied"), TOAST_COPY_MS));
  }, [alert, file.path, t]);

  const requestCloseTab = useCallback(() => {
    if (isDirtyRef.current) {
      session.setConfirmDiscard("close");
    } else {
      onForceClose();
    }
  }, [onForceClose, session]);

  const shouldBypassEditorMenu = useCallback(
    (target: EventTarget | null) =>
      Boolean(
        getEditableInput(target) ||
          (target as HTMLElement | null)?.closest?.("[data-modal-root='true']")
      ),
    []
  );

  const buildSharedMenuOpts = useCallback(
    () => ({
      t,
      editorReady: Boolean(cm.viewRef.current) && editorReady,
      readonly: effectiveReadonly,
      fileReadonly,
      isDirty,
      saving: session.saving,
      loading: session.loading,
      retrying: session.retrying,
      connecting: session.connecting,
      isRemoteConnecting: session.isRemoteConnecting,
      wordWrap,
      eol: session.eol,
      isRemote: session.isRemote,
      isDisconnected: session.isRemoteOffline,
      onFind: () => search.openFindBar(false),
      onReplace: () => search.openFindBar(true),
      onGotoLine: openGotoBar,
      onToggleWordWrap: () => setWordWrap((v) => !v),
      onToggleReadonly: () => setUserReadonly((v) => !v),
      onToggleEol: session.toggleEol,
      onSave: () => void session.handleSave(),
      onReload: requestReload,
      onReconnect: session.isRemote ? () => session.manualReconnect("tab") : undefined,
      onCopyPath: handleCopyPath,
      onOpenSshTab,
      onOpenSftpTab,
      onOpenSettings,
      onClose: requestCloseTab,
    }),
    [
      cm.viewRef,
      editorReady,
      effectiveReadonly,
      fileReadonly,
      handleCopyPath,
      isDirty,
      onOpenSettings,
      onOpenSftpTab,
      onOpenSshTab,
      openGotoBar,
      requestCloseTab,
      requestReload,
      search,
      session,
      t,
      wordWrap,
    ]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (shouldBypassEditorMenu(e.target)) return;
      e.preventDefault();
      e.stopPropagation();

      const view = cm.viewRef.current;
      const sel = view?.state.selection.main;
      const isInsideEditorHost =
        Boolean(cm.editorHostRef.current) &&
        e.target instanceof Node &&
        cm.editorHostRef.current!.contains(e.target);

      if (view && isInsideEditorHost && sel && sel.empty && (e.clientX !== 0 || e.clientY !== 0)) {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos !== null) {
          view.dispatch({ selection: { anchor: pos } });
        }
      }

      const activeSel = view?.state.selection.main;
      const selectedText =
        view && activeSel && !activeSel.empty
          ? view.state.sliceDoc(activeSel.from, activeSel.to)
          : "";

      onShowMenu(
        e.clientX,
        e.clientY,
        buildEditorContextItems({
          ...buildSharedMenuOpts(),
          hasSelection: selectedText.length > 0,
          onCut: () => {
            if (!view || !selectedText || effectiveReadonly) return;
            void copyText(selectedText);
            view.dispatch(view.state.replaceSelection(""));
            view.focus();
          },
          onCopy: () => {
            if (selectedText) void copyText(selectedText);
            view?.focus();
          },
          onPaste: () => {
            if (!view || effectiveReadonly) return;
            void readText().then((txt) => {
              if (!txt || !cm.viewRef.current) return;
              cm.viewRef.current.dispatch(cm.viewRef.current.state.replaceSelection(txt));
              cm.viewRef.current.focus();
            });
          },
          onSelectAll: () => {
            if (!view) return;
            selectAll(view);
            view.focus();
          },
        })
      );
    },
    [
      buildSharedMenuOpts,
      cm.editorHostRef,
      cm.viewRef,
      effectiveReadonly,
      onShowMenu,
      shouldBypassEditorMenu,
    ]
  );

  const handleToolbarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (shouldBypassEditorMenu(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      onShowMenu(e.clientX, e.clientY, buildEditorToolbarMenu(buildSharedMenuOpts()));
    },
    [buildSharedMenuOpts, onShowMenu, shouldBypassEditorMenu]
  );

  const handleBannerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const selectedText = window.getSelection()?.toString() ?? "";
      onShowMenu(
        e.clientX,
        e.clientY,
        buildEditorBannerMenu({
          t,
          selectedText,
          isConnecting: session.connecting || session.isRemoteConnecting,
          reloadDisabled:
            session.loading || session.retrying || session.saving || session.connecting,
          onCopy: (text) => void copyText(text),
          onReconnect: () => session.manualReconnect("banner"),
          onReload: requestReload,
          onOpenSettings,
          onClose: requestCloseTab,
        })
      );
    },
    [onOpenSettings, onShowMenu, requestCloseTab, requestReload, session, t]
  );

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (hasBlockingModal || gotoOpen || session.confirmDiscard || hasLoadErrorModal) return;
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "s") {
          e.preventDefault();
          e.stopPropagation();
          void saveFnRef.current();
          return;
        }
        if (key === "f") {
          e.preventDefault();
          e.stopPropagation();
          openFindRef.current(false);
          return;
        }
        if (key === "h") {
          e.preventDefault();
          e.stopPropagation();
          openFindRef.current(true);
          return;
        }
        if (key === "g") {
          e.preventDefault();
          e.stopPropagation();
          openGotoRef.current();
          return;
        }
        if (key === "=" || key === "+") {
          e.preventDefault();
          e.stopPropagation();
          adjustFontSize(1);
          return;
        }
        if (key === "-") {
          e.preventDefault();
          e.stopPropagation();
          adjustFontSize(-1);
          return;
        }
        if (key === "0") {
          e.preventDefault();
          e.stopPropagation();
          setFontSize(EDITOR_FONT_SIZE_DEFAULT);
          return;
        }
      }
      if (e.key === "Escape") {
        if (search.findOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeFindRef.current();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    adjustFontSize,
    gotoOpen,
    hasBlockingModal,
    hasLoadErrorModal,
    isActive,
    search.findOpen,
    session.confirmDiscard,
  ]);

  const zoomPercent = Math.round((fontSize / EDITOR_FONT_SIZE_DEFAULT) * 100);
  const handleStatusBarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (shouldBypassEditorMenu(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      onShowMenu(
        e.clientX,
        e.clientY,
        buildEditorStatusBarMenu({
          t,
          editorReady: Boolean(cm.viewRef.current) && editorReady,
          readonly: effectiveReadonly,
          fileReadonly,
          wordWrap,
          eol: session.eol,
          zoomPercent,
          canZoomIn: fontSize < EDITOR_FONT_SIZE_MAX,
          canZoomOut: fontSize > EDITOR_FONT_SIZE_MIN,
          onGotoLine: openGotoBar,
          onToggleEol: session.toggleEol,
          onZoomIn: () => adjustFontSize(1),
          onZoomOut: () => adjustFontSize(-1),
          onZoomReset: () => setFontSize(EDITOR_FONT_SIZE_DEFAULT),
          onToggleWordWrap: () => setWordWrap((v) => !v),
          onToggleReadonly: () => setUserReadonly((v) => !v),
          onCopyPath: handleCopyPath,
          onOpenSettings,
          onClose: requestCloseTab,
        })
      );
    },
    [
      adjustFontSize,
      cm.viewRef,
      editorReady,
      effectiveReadonly,
      fileReadonly,
      fontSize,
      handleCopyPath,
      onOpenSettings,
      onShowMenu,
      openGotoBar,
      requestCloseTab,
      session.eol,
      session.toggleEol,
      shouldBypassEditorMenu,
      t,
      wordWrap,
      zoomPercent,
    ]
  );

  const showConnectingBanner =
    session.isRemoteConnecting &&
    (tab.reconnectSource === "auto" || tab.reconnectSource === "banner");
  const showReconnectBanner =
    session.hasLoadedDoc &&
    !session.loadError &&
    (session.isRemoteOffline || showConnectingBanner);

  return (
    <div
      onContextMenu={handleContextMenu}
      className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-ct-editor text-slate-200"
    >
      {session.isRemoteConnecting && (
        <div className="pointer-events-none absolute top-0 left-0 right-0 z-30 h-[2px] overflow-hidden bg-sky-950/30">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-ct-accent to-transparent animate-shimmer" />
        </div>
      )}

      <EditorToolbar
        hostLabel={file.hostLabel}
        path={file.path}
        editorReady={editorReady}
        findOpen={search.findOpen}
        gotoOpen={gotoOpen}
        wordWrap={wordWrap}
        effectiveReadonly={session.effectiveReadonly}
        fileReadonly={session.fileReadonly}
        loading={session.loading}
        retrying={session.retrying}
        saving={session.saving}
        connecting={session.connecting}
        isDirty={isDirty}
        isRemoteOffline={session.isRemoteOffline}
        isRemote={session.isRemote}
        isRemoteConnecting={session.isRemoteConnecting}
        onCopyPath={handleCopyPath}
        onOpenFind={() => search.openFindBar(false)}
        onOpenGoto={openGotoBar}
        onToggleWordWrap={() => setWordWrap((v) => !v)}
        onToggleReadonly={() => setUserReadonly((v) => !v)}
        onReload={requestReload}
        onSave={() => void session.handleSave()}
        onContextMenu={handleToolbarContextMenu}
      />

      <div
        onContextMenu={handleContextMenu}
        onMouseDownCapture={(e) => {
          if (getEditableInput(e.target)) return;
          const view = cm.viewRef.current;
          if (
            view &&
            shouldPreventRightClickSelectionCollapse(e.button, view.state.selection.main.empty)
          ) {
            e.preventDefault();
          }
        }}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-ct-editor"
      >
        <FindBar
          isOpen={search.findOpen && editorReady}
          inputRef={search.findInputRef}
          query={search.findQuery}
          onChangeQuery={search.setFindQuery}
          caseSensitive={search.caseSensitive}
          onToggleCaseSensitive={() => search.setCaseSensitive((v) => !v)}
          wholeWord={search.wholeWord}
          onToggleWholeWord={() => search.setWholeWord((v) => !v)}
          regex={search.regex}
          onToggleRegex={() => search.setRegex((v) => !v)}
          invalidRegex={search.invalidRegex}
          matches={search.findMatches}
          onFindPrev={search.handleFindPrev}
          onFindNext={search.handleFindNext}
          onClose={search.closeFindBar}
          allowReplace
          showReplace={search.showReplace}
          onToggleReplace={() => search.setShowReplace((v) => !v)}
          replaceQuery={search.replaceQuery}
          onChangeReplaceQuery={search.setReplaceQuery}
          replaceReadonly={session.effectiveReadonly}
          onReplaceNext={search.handleReplaceNext}
          onReplaceAll={search.handleReplaceAll}
        />

        {session.loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ct-editor text-xs text-slate-400 select-none">
            <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
            <span>{t("editor.loading")}</span>
          </div>
        )}

        {!session.loading && session.loadError && (
          <EditorLoadErrorView
            isOpen={isActive}
            closeOnEscape={isActive && !hasTopLevelModal}
            loadError={session.loadError}
            loadErrDisconnected={session.loadErrDisconnected}
            connecting={session.connecting}
            retrying={session.retrying}
            isAutoReconnect={session.isAutoReconnect}
            onForceClose={onForceClose}
            onReconnectAndReload={() => session.reconnectAndReload(true)}
            onRetryLoad={() => void session.loadFile(true)}
          />
        )}

        <div
          ref={cm.editorHostRef}
          className={`min-h-0 flex-1 overflow-hidden ${
            session.loading || session.loadError ? "hidden" : "block"
          }`}
        />

        {showReconnectBanner && (
          <ReconnectBanner
            isDisconnected={session.isRemoteOffline}
            isConnecting={session.isRemoteConnecting}
            isAutoReconnect={session.isAutoReconnect}
            onReconnect={() => session.manualReconnect("banner")}
            onContextMenu={handleBannerContextMenu}
          />
        )}
      </div>

      <EditorStatusBar
        cursorPos={cm.cursorPos}
        totalChars={cm.totalChars}
        langId={cm.langId}
        editorReady={editorReady}
        effectiveReadonly={session.effectiveReadonly}
        zoomPercent={zoomPercent}
        eol={session.eol}
        onToggleEol={session.toggleEol}
        onContextMenu={handleStatusBarContextMenu}
      />

      <EditorGotoLineModal
        view={cm.viewRef.current}
        isOpen={isActive && gotoOpen && editorReady}
        closeOnEscape={!hasTopLevelModal}
        totalLines={cm.totalLines}
        onClose={() => setGotoOpen(false)}
      />

      <EditorDiscardModal
        confirmDiscard={isActive ? session.confirmDiscard : null}
        closeOnEscape={!hasTopLevelModal}
        fileName={file.name}
        saving={session.saving}
        canSaveAndClose={!session.effectiveReadonly && !session.isRemoteOffline}
        onCancel={() => session.setConfirmDiscard(null)}
        onDiscard={() => {
          const action = session.confirmDiscard;
          session.setConfirmDiscard(null);
          if (action === "close") onForceClose();
          else if (session.isRemote && session.isRemoteOffline) session.reconnectAndReload(false);
          else void session.loadFile();
        }}
        onSaveAndClose={async () => {
          const ok = await session.handleSave();
          if (ok) {
            session.setConfirmDiscard(null);
            onForceClose();
          }
        }}
      />
    </div>
  );
};
