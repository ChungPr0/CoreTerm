import React, { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CornerLeftUp,
  FolderPlus,
  HardDrive,
  Home,
  RefreshCw,
  Search,
} from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { IconButton, Input, PopoverMenu } from "@/shared/ui";
import { splitLocalCrumbs, splitRemoteCrumbs } from "@/shared/utils/path";
import type { LocalDriveDto } from "../types";

interface FileListHeaderProps {
  kind: "local" | "remote";
  title: string;
  cwd: string;
  loading: boolean;
  filter: string;
  drives?: LocalDriveDto[];
  actions?: React.ReactNode;
  canGoBack: boolean;
  canGoForward: boolean;
  onChangeFilter: (v: string) => void;
  onNavigate: (path: string) => void;
  onBack?: () => void;
  onForward?: () => void;
  onUp: () => void;
  onHome: () => void;
  onRefresh: () => void;
  onRefreshDrives?: () => void;
  onNewFolder: () => void;
}

export const FileListHeader: React.FC<FileListHeaderProps> = ({
  kind,
  title,
  cwd,
  loading,
  filter,
  drives,
  actions,
  canGoBack,
  canGoForward,
  onChangeFilter,
  onNavigate,
  onBack,
  onForward,
  onUp,
  onHome,
  onRefresh,
  onRefreshDrives,
  onNewFolder,
}) => {
  const { t } = useI18n();
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState(cwd);
  const [driveMenuOpen, setDriveMenuOpen] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const driveBtnRef = useRef<HTMLButtonElement>(null);

  const crumbs = kind === "local" ? splitLocalCrumbs(cwd) : splitRemoteCrumbs(cwd);
  const lowerCwd = cwd.toLowerCase();
  const activeDrive = drives?.find(
    (d) =>
      lowerCwd.startsWith(d.path.toLowerCase()) ||
      `${lowerCwd.replace(/\/+$/, "")}/` === d.path.toLowerCase()
  );
  const cwdWinDrive =
    kind === "remote"
      ? cwd.match(/^\/([a-zA-Z]:)(?:\/|$)/)?.[1]?.toUpperCase()
      : undefined;

  const badgeCls =
    kind === "remote"
      ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
      : "border-[#388bfd]/35 bg-[#1f6feb]/15 text-[#58a6ff]";

  const openPathEditor = () => {
    setPathDraft(cwd);
    setEditingPath(true);
    window.setTimeout(() => {
      pathInputRef.current?.focus();
      pathInputRef.current?.select();
    }, 10);
  };

  const submitPathEditor = (e: React.FormEvent) => {
    e.preventDefault();
    const next = pathDraft.trim();
    setEditingPath(false);
    if (next && next !== cwd) onNavigate(next);
  };

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-b border-[#21262d] bg-[#11161d] px-2.5 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span
            className={`inline-flex h-6 items-center rounded border px-2 text-[11px] font-medium ${badgeCls}`}
          >
            {title}
          </span>

          {drives && drives.length > 0 && (
            <div className="relative">
              <button
                ref={driveBtnRef}
                type="button"
                onClick={() => {
                  onRefreshDrives?.();
                  setDriveMenuOpen((v) => !v);
                }}
                className="inline-flex h-6 items-center gap-1 rounded border border-[#30363d] bg-[#0d1117] px-2 text-[11px] text-[#c9d1d9] hover:border-[#388bfd]"
              >
                <HardDrive className="h-3 w-3 text-[#8b949e]" />
                <span>{activeDrive?.name ?? cwdWinDrive ?? drives[0].name}</span>
                <ChevronDown className="h-3 w-3 text-[#8b949e]" />
              </button>

              <PopoverMenu
                isOpen={driveMenuOpen}
                onClose={() => setDriveMenuOpen(false)}
                anchorRef={driveBtnRef}
                className="absolute left-0 top-full z-40 mt-1 min-w-[140px] rounded-md border border-[#30363d] bg-[#161b22] py-1 shadow-xl"
              >
                {drives.map((d) => {
                  const selected = activeDrive?.path === d.path;
                  return (
                    <button
                      key={d.path}
                      type="button"
                      onClick={() => {
                        setDriveMenuOpen(false);
                        onNavigate(d.path);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1 text-left text-[11px] ${
                        selected
                          ? "bg-[#1f6feb]/20 text-[#58a6ff]"
                          : "text-[#c9d1d9] hover:bg-[#21262d]"
                      }`}
                    >
                      <span className="truncate font-mono">{d.name}</span>
                      {selected && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })}
              </PopoverMenu>
            </div>
          )}

          {onBack && (
            <IconButton
              disabled={!canGoBack}
              onClick={onBack}
              title={t("sftp.go_back")}
              size="sm"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
            />
          )}
          {onForward && (
            <IconButton
              disabled={!canGoForward}
              onClick={onForward}
              title={t("sftp.go_forward")}
              size="sm"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            />
          )}
          <IconButton
            onClick={onUp}
            title={t("sftp.go_up")}
            size="sm"
            icon={<CornerLeftUp className="h-3.5 w-3.5" />}
          />
          <IconButton
            onClick={onHome}
            title={t("sftp.home")}
            size="sm"
            icon={<Home className="h-3.5 w-3.5" />}
          />
          <IconButton
            onClick={onRefresh}
            title={t("sftp.refresh")}
            size="sm"
            icon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-[#58a6ff]" : ""}`} />}
          />
          <IconButton
            onClick={onNewFolder}
            title={t("sftp.new_folder")}
            size="sm"
            icon={<FolderPlus className="h-3.5 w-3.5" />}
          />
        </div>

        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>

      <div className="flex h-[41px] shrink-0 min-w-0 items-center gap-2 border-b border-[#21262d] bg-[#0d1117] px-2.5">
        {editingPath ? (
          <form noValidate onSubmit={submitPathEditor} className="flex h-7 min-w-0 flex-1 items-center">
            <Input
              ref={pathInputRef}
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => setEditingPath(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingPath(false);
                }
              }}
              inputSize="sm"
              className="font-mono text-xs"
            />
          </form>
        ) : (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) openPathEditor();
            }}
            onDoubleClick={openPathEditor}
            className="no-scrollbar flex h-7 min-w-0 flex-1 cursor-text items-center gap-0.5 overflow-x-auto rounded border border-[#21262d] bg-[#161b22] px-2 font-mono text-xs text-[#c9d1d9]"
          >
            {crumbs.map((c, idx) => (
              <React.Fragment key={c.path}>
                {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[#484f58]" />}
                <button
                  type="button"
                  onClick={() => onNavigate(c.path)}
                  className="inline-flex h-5 shrink-0 items-center rounded px-1 hover:bg-[#21262d] hover:text-white"
                >
                  {c.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="relative flex h-7 w-28 min-w-[76px] shrink items-center sm:w-36">
          <Input
            type="text"
            value={filter}
            onChange={(e) => onChangeFilter(e.target.value)}
            placeholder={t("sftp.filter_placeholder")}
            leftIcon={<Search className="h-3 w-3 text-[#6e7681]" />}
            inputSize="sm"
          />
        </div>
      </div>
    </>
  );
};
