import React, { useState } from "react";
import { FolderOpen, Pencil, Plus, Save, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import type { ShellProfile } from "@/shared/types/ipc";
import { Button, IconButton, Input } from "@/shared/ui";
import { useI18n } from "@/shared/i18n";
import { useAlert } from "@/shared/ui";
import {
  formatShellArgs,
  makeCustomShell,
  parseShellArgs,
  sessionApi,
  shellNameFromPath,
} from "@/modules/terminal";
import { ShellIcon } from "@/modules/workspace";

interface CustomShellsSectionProps {
  customShells: ShellProfile[];
  onChange: (next: ShellProfile[]) => void;
  onFirstAdd?: (profile: ShellProfile) => void;
}

export const CustomShellsSection: React.FC<CustomShellsSectionProps> = ({
  customShells,
  onChange,
  onFirstAdd,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [executable, setExecutable] = useState("");
  const [argsText, setArgsText] = useState("");
  const [validating, setValidating] = useState(false);

  const isEditorOpen = isAdding || editingId !== null;

  const resetEditor = () => {
    setIsAdding(false);
    setEditingId(null);
    setName("");
    setExecutable("");
    setArgsText("");
  };

  const openAdd = () => {
    setEditingId(null);
    setName("");
    setExecutable("");
    setArgsText("");
    setIsAdding(true);
  };

  const openEdit = (shell: ShellProfile) => {
    setIsAdding(false);
    setEditingId(shell.id);
    setName(shell.name);
    setExecutable(shell.executable);
    setArgsText(formatShellArgs(shell.args));
  };

  const pickExe = async () => {
    try {
      const picked = await sessionApi.pickShellExe(executable.trim() || undefined, {
        executable: t("settings.file_filter_exe"),
        allFiles: t("settings.file_filter_all"),
      });
      if (!picked) return;
      setExecutable(picked);
      if (!name.trim()) {
        setName(shellNameFromPath(picked, t("settings.custom_shell_fallback")));
      }
    } catch {
      // Ignore user cancellation / dialog close
    }
  };

  const saveShell = async () => {
    const trimmedExe = executable.trim().replace(/^"+|"+$/g, "");
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert.error(t("settings.shell_name_req"));
      return;
    }
    if (!trimmedExe) {
      alert.error(t("settings.shell_path_req"));
      return;
    }

    setValidating(true);
    try {
      const resolved = await sessionApi.checkShellExe(trimmedExe);
      if (!resolved) {
        alert.error(t("settings.shell_path_invalid"));
        return;
      }

      const nextProfile = makeCustomShell({
        id: editingId ?? undefined,
        name: trimmedName,
        executable: resolved,
        args: parseShellArgs(argsText),
      });

      const nextList =
        editingId !== null
          ? customShells.map((s) => (s.id === editingId ? nextProfile : s))
          : [...customShells, nextProfile];
      onChange(nextList);
      if (editingId === null) {
        onFirstAdd?.(nextProfile);
      }
      resetEditor();
    } catch {
      alert.error(t("settings.shell_path_invalid"));
    } finally {
      setValidating(false);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void saveShell();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      resetEditor();
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
            <TerminalIcon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>{t("settings.custom_shells")}</span>
          </div>
          <p className="text-[11px] text-slate-500">{t("settings.custom_shells_hint")}</p>
        </div>

        {!isEditorOpen && (
          <Button
            variant="outline"
            size="xs"
            onClick={openAdd}
            className="shrink-0"
            leftIcon={<Plus className="w-3 h-3 text-sky-400" />}
          >
            {t("settings.shell_add")}
          </Button>
        )}
      </div>

      {customShells.length === 0 && !isEditorOpen && (
        <div className="px-3 py-2 rounded border border-dashed border-slate-800/80 text-[11px] text-slate-500 text-center">
          {t("settings.custom_shells_empty")}
        </div>
      )}

      {customShells.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
          {customShells.map((shell) => {
            const argsPreview = formatShellArgs(shell.args);
            const detail = argsPreview
              ? `${shell.executable} ${argsPreview}`
              : shell.executable;
            return (
              <div
                key={shell.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-slate-900/90 border border-slate-800/90"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShellIcon profile={shell} />
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 truncate">{shell.name}</div>
                    <div
                      title={detail}
                      className="text-[10px] font-mono text-slate-500 truncate"
                    >
                      {detail}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    size="sm"
                    tone="sky"
                    title={t("common.edit")}
                    onClick={() => openEdit(shell)}
                    icon={<Pencil className="w-3 h-3" />}
                  />
                  <IconButton
                    size="sm"
                    tone="rose"
                    title={t("common.delete")}
                    onClick={() => {
                      if (editingId === shell.id) resetEditor();
                      onChange(customShells.filter((c) => c.id !== shell.id));
                    }}
                    icon={<Trash2 className="w-3 h-3" />}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isEditorOpen && (
        <div
          onKeyDown={handleEditorKeyDown}
          className="p-2.5 rounded-lg bg-slate-900/95 border border-slate-700/80 space-y-2"
        >
          <div className="text-[11px] font-semibold text-slate-200">
            {editingId ? t("settings.shell_edit") : t("settings.shell_add")}
          </div>

          <Input
            type="text"
            label={<span className="text-[11px] text-slate-400">{`${t("settings.shell_name")} *`}</span>}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.shell_name_hint")}
          />

          <div className="space-y-1">
            <label className="block text-[11px] text-slate-400">
              {`${t("settings.shell_path")} *`}
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                type="text"
                value={executable}
                onChange={(e) => setExecutable(e.target.value)}
                placeholder={t("settings.shell_path_hint")}
                className="font-mono text-[11px]"
                containerClassName="flex-1 min-w-0"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={() => void pickExe()}
                className="shrink-0"
                leftIcon={<FolderOpen className="w-3.5 h-3.5 text-sky-400" />}
              >
                {t("settings.shell_browse")}
              </Button>
            </div>
          </div>

          <Input
            type="text"
            label={<span className="text-[11px] text-slate-400">{t("settings.shell_args")}</span>}
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            placeholder={t("settings.shell_args_hint")}
            className="font-mono text-[11px]"
          />

          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button variant="secondary" size="xs" onClick={resetEditor}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="xs"
              loading={validating}
              leftIcon={<Save className="w-3 h-3" />}
              onClick={() => void saveShell()}
            >
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
