import React, { useEffect, useState } from "react";
import { FolderOpen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { ShellProfile } from "@/shared/types/ipc";
import { Button, IconButton, Input, ShellIcon, useAlert } from "@/shared/ui";
import { useI18n } from "@/shared/i18n";
import { sessionApi } from "@/modules/terminal/api/sessionApi";
import {
  formatShellArgs,
  makeCustomShell,
  parseShellArgs,
  shellNameFromPath,
} from "@/modules/terminal/hooks/useShellsStore";

interface CustomShellsSectionProps {
  customShells: ShellProfile[];
  effectiveDefaultShellId?: string;
  onSelectDefault?: (shell: ShellProfile) => void;
  onChange: (next: ShellProfile[]) => void;
  onFirstAdd?: (profile: ShellProfile) => void;
  onRequestDelete?: (shell: ShellProfile) => void;
  onEditorDirtyChange?: (dirty: boolean) => void;
  fullHeight?: boolean;
}

export const CustomShellsSection: React.FC<CustomShellsSectionProps> = ({
  customShells,
  effectiveDefaultShellId,
  onSelectDefault,
  onChange,
  onFirstAdd,
  onRequestDelete,
  onEditorDirtyChange,
  fullHeight = false,
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

  useEffect(() => {
    if (editingId && !customShells.some((s) => s.id === editingId)) {
      resetEditor();
    }
  }, [customShells, editingId]);

  useEffect(() => {
    if (!onEditorDirtyChange) return;
    if (isAdding) {
      onEditorDirtyChange(
        Boolean(name.trim() || executable.trim() || argsText.trim())
      );
      return;
    }
    if (editingId !== null) {
      const original = customShells.find((s) => s.id === editingId);
      if (!original) {
        onEditorDirtyChange(false);
        return;
      }
      onEditorDirtyChange(
        name !== original.name ||
          executable !== original.executable ||
          argsText !== formatShellArgs(original.args)
      );
      return;
    }
    onEditorDirtyChange(false);
  }, [argsText, customShells, editingId, executable, isAdding, name, onEditorDirtyChange]);

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
    <div className="rounded-xl border border-slate-800/90 bg-slate-950/65">
      <div className="px-4 py-2 rounded-t-xl border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("settings.custom_shells")}
        </span>

        {!isEditorOpen && (
          <Button
            variant="outline"
            size="xs"
            onClick={openAdd}
            className="shrink-0"
            leftIcon={<Plus className="w-3 h-3" />}
          >
            {t("settings.shell_add")}
          </Button>
        )}
      </div>

      {customShells.length === 0 && !isEditorOpen && (
        <div className="px-4 py-4 text-center text-[11px] text-slate-500 space-y-0.5">
          <div>{t("settings.custom_shells_empty")}</div>
          <div>{t("settings.custom_shells_hint")}</div>
        </div>
      )}

      {customShells.length > 0 && (
        <div
          className={`divide-y divide-slate-800/70 ${
            fullHeight ? "" : "max-h-36 overflow-y-auto"
          }`}
        >
          {customShells.map((shell) => {
            const isDefault = shell.id === effectiveDefaultShellId;
            const argsPreview = formatShellArgs(shell.args);
            const detail = argsPreview
              ? `${shell.executable} ${argsPreview}`
              : shell.executable;
            return (
              <div
                key={shell.id}
                className="flex h-[52px] items-center justify-between gap-3 px-4"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShellIcon profile={shell} />
                  <div className="min-w-0">
                    <div className="flex h-5 items-center gap-2">
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {shell.name}
                      </span>
                      {isDefault && (
                        <span className="shrink-0 px-1.5 py-0.5 leading-none rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                          {t("vault.default")}
                        </span>
                      )}
                    </div>
                    <div
                      data-tooltip={detail}
                      className="h-4 leading-4 text-[11px] font-mono text-slate-500 truncate"
                    >
                      {detail}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isDefault && onSelectDefault && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onSelectDefault(shell)}
                    >
                      {t("settings.set_as_default")}
                    </Button>
                  )}
                  <IconButton
                    size="sm"
                    tabIndex={0}
                    tone="sky"
                    title={t("common.edit")}
                    onClick={() => openEdit(shell)}
                    icon={<Pencil className="w-3 h-3" />}
                  />
                  <IconButton
                    size="sm"
                    tabIndex={0}
                    tone="rose"
                    title={t("common.delete")}
                    onClick={() => {
                      if (onRequestDelete) {
                        onRequestDelete(shell);
                        return;
                      }
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
          className="p-4 rounded-b-xl bg-slate-900/40 border-t border-slate-800/80 space-y-2.5"
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
