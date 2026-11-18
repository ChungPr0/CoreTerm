import React, { Suspense, lazy } from "react";
import type {
  SftpConflictPolicy,
  SftpConnectionState,
  TerminalTabItem,
} from "@/shared/types/ipc";
import type { ContextMenuEntry } from "@/shared/ui";

const SftpPane = lazy(() =>
  import("./SftpPane").then((m) => ({ default: m.SftpPane }))
);

interface SftpSplitContainerProps {
  tab: TerminalTabItem;
  isActive: boolean;
  conflictPolicy: SftpConflictPolicy;
  pauseAutoReconnect?: boolean;
  terminal?: React.ReactNode;
  onStartSplitResize: (tabId: string, e: React.MouseEvent<HTMLDivElement>) => void;
  onToggleSftpSplit: (tabId: string) => void;
  onOpenInTerminal: (tabId: string, remotePath: string) => void;
  onShowMenu: (x: number, y: number, items: ContextMenuEntry[]) => void;
  onConfirmDelete: (opts: {
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }) => void;
  onModalChange: (tabId: string, open: boolean) => void;
  onSftpState: (tabId: string, state: SftpConnectionState) => void;
  onToggleAutoReconnect: (tabId: string, enabled: boolean) => void;
}

export const SftpSplitContainer: React.FC<SftpSplitContainerProps> = ({
  tab,
  isActive,
  conflictPolicy,
  pauseAutoReconnect = false,
  terminal,
  onStartSplitResize,
  onToggleSftpSplit,
  onOpenInTerminal,
  onShowMenu,
  onConfirmDelete,
  onModalChange,
  onSftpState,
  onToggleAutoReconnect,
}) => {
  if (tab.tabKind === "sftp") {
    return (
      <div
        style={{ display: isActive ? "flex" : "none" }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090d16]"
      >
        <Suspense fallback={null}>
          <SftpPane
            tab={tab}
            isActive={isActive}
            isVisible={isActive}
            mode="full"
            conflictPolicy={conflictPolicy}
            pauseAutoReconnect={pauseAutoReconnect}
            onShowMenu={onShowMenu}
            onConfirmDelete={onConfirmDelete}
            onModalChange={onModalChange}
            onSftpState={onSftpState}
            onToggleAutoReconnect={onToggleAutoReconnect}
          />
        </Suspense>
      </div>
    );
  }

  const ratio = tab.sftpSplitRatio ?? 0.45;
  const sftpOpen = Boolean(tab.sftpOpen);
  const sftpVisible = isActive && sftpOpen;

  return (
    <div
      style={{ display: isActive ? "flex" : "none" }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#090d16]"
    >
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={sftpOpen ? { height: `calc(${Math.round((1 - ratio) * 1000) / 10}% - 3px)` } : { flex: 1 }}
      >
        {terminal}
      </div>

      {sftpOpen && (
        <div
          onMouseDown={(e) => onStartSplitResize(tab.tabId, e)}
          className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-slate-800 bg-slate-800/80 transition-colors hover:bg-sky-500/70"
        >
          <div className="h-0.5 w-8 rounded-full bg-slate-500/60" />
        </div>
      )}

      {sftpOpen && (
        <div
          style={{
            height: `calc(${Math.round(ratio * 1000) / 10}% - 3px)`,
          }}
          className="flex min-h-0 flex-col overflow-hidden"
        >
          <Suspense fallback={null}>
            <SftpPane
              tab={tab}
              isActive={isActive}
              isVisible={sftpVisible}
              mode="split"
              conflictPolicy={conflictPolicy}
              pauseAutoReconnect={pauseAutoReconnect}
              onOpenInTerminal={(remotePath) => onOpenInTerminal(tab.tabId, remotePath)}
              onShowMenu={onShowMenu}
              onConfirmDelete={onConfirmDelete}
              onModalChange={onModalChange}
              onSftpState={onSftpState}
              onToggleAutoReconnect={onToggleAutoReconnect}
              onCloseSplit={() => onToggleSftpSplit(tab.tabId)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};
