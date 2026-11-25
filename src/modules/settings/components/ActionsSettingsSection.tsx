import React, { useEffect, useState } from "react";
import { Keyboard, Pencil, RotateCcw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, IconButton } from "@/shared/ui";
import {
  eventToShortcutChord,
  findConflictingShortcut,
  getShortcutChord,
  isValidShortcutChord,
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutDefinition,
} from "@/shared/utils/shortcuts";
import type { AppSettingsValues } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

const TAB_WINDOW_ACTION_IDS: readonly ShortcutActionId[] = [
  "newTab",
  "duplicateTab",
  "closeTab",
  "nextTab",
  "prevTab",
  "commandPalette",
  "toggleSidebar",
  "toggleSftpPanel",
  "openSettings",
  "toggleFullscreen",
];

const TERMINAL_ACTION_IDS: readonly ShortcutActionId[] = [
  "termCopy",
  "termPaste",
  "termSelectAll",
  "termClear",
  "termFind",
  "termZoomIn",
  "termZoomOut",
  "termZoomReset",
];

interface ActionsSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onEditingChange?: (editing: boolean) => void;
  onResetSection?: () => void;
}

export const ActionsSettingsSection: React.FC<ActionsSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onEditingChange,
  onResetSection,
}) => {
  const { t } = useI18n();
  const [editingDef, setEditingDef] = useState<ShortcutDefinition | null>(null);
  const [draftChord, setDraftChord] = useState<string>("");
  const [invalidAttempt, setInvalidAttempt] = useState(false);

  useEffect(() => {
    onEditingChange?.(editingDef !== null);
    return () => {
      onEditingChange?.(false);
    };
  }, [editingDef, onEditingChange]);

  const openEditor = (def: ShortcutDefinition) => {
    setEditingDef(def);
    setDraftChord(getShortcutChord(def.id, settings.keybindings));
    setInvalidAttempt(false);
  };

  const closeEditor = () => {
    setEditingDef(null);
    setDraftChord("");
    setInvalidAttempt(false);
  };

  const conflictDef =
    editingDef && draftChord && isValidShortcutChord(draftChord)
      ? findConflictingShortcut(draftChord, settings.keybindings, editingDef.id)
      : null;

  const canSaveDraft =
    Boolean(editingDef) &&
    Boolean(draftChord) &&
    isValidShortcutChord(draftChord) &&
    !conflictDef;

  const commitDraft = () => {
    if (!editingDef || !canSaveDraft) return;
    const nextBindings = { ...settings.keybindings };
    if (draftChord === editingDef.defaultChord) {
      delete nextBindings[editingDef.id];
    } else {
      nextBindings[editingDef.id] = draftChord;
    }
    onPatch({ keybindings: nextBindings });
    closeEditor();
  };

  const resetSingleShortcut = (def: ShortcutDefinition) => {
    if (!settings.keybindings[def.id]) return;
    const nextBindings = { ...settings.keybindings };
    delete nextBindings[def.id];
    onPatch({ keybindings: nextBindings });
  };

  useEffect(() => {
    if (!editingDef) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        closeEditor();
        return;
      }
      if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        return;
      }
      const chord = eventToShortcutChord(e);
      if (!chord) return;
      e.preventDefault();
      e.stopPropagation();
      if (!isValidShortcutChord(chord)) {
        setInvalidAttempt(true);
        return;
      }
      setInvalidAttempt(false);
      setDraftChord(chord);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editingDef]);

  const defsById = new Map(SHORTCUT_DEFINITIONS.map((d) => [d.id, d]));

  const renderActionRow = (id: ShortcutActionId, groupTitle: string) => {
    const def = defsById.get(id);
    if (!def) return null;
    const activeChord = getShortcutChord(def.id, settings.keybindings);
    const isCustomized = activeChord !== def.defaultChord;
    const label = t(def.labelKey);
    const visible = matchesSettingsQuery(
      query,
      t("settings.cat_actions"),
      groupTitle,
      label,
      activeChord,
      def.defaultChord,
      "shortcut keybinding hotkey action"
    );

    return (
      <SettingsRow key={def.id} visible={visible} title={label}>
        <div className="flex items-center gap-1.5">
          {isCustomized && (
            <IconButton
              size="xs"
              onClick={() => resetSingleShortcut(def)}
              title={t("settings.shortcut_reset_one", { shortcut: def.defaultChord })}
              icon={<RotateCcw className="h-3 w-3" />}
            />
          )}
          <kbd
            className={`inline-flex h-6 items-center rounded-md border px-2 font-mono text-[11px] font-medium ${
              isCustomized
                ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                : "border-slate-700/80 bg-slate-900/90 text-slate-200"
            }`}
          >
            {activeChord}
          </kbd>
          <IconButton
            size="xs"
            onClick={() => openEditor(def)}
            title={t("common.edit")}
            icon={<Pencil className="h-3 w-3" />}
          />
        </div>
      </SettingsRow>
    );
  };

  const tabGroupTitle = t("settings.group_tabs_window");
  const termGroupTitle = t("settings.cat_terminal");

  const anyVisible = SHORTCUT_DEFINITIONS.some((def) => {
    const activeChord = getShortcutChord(def.id, settings.keybindings);
    const groupTitle = TAB_WINDOW_ACTION_IDS.includes(def.id)
      ? tabGroupTitle
      : termGroupTitle;
    return matchesSettingsQuery(
      query,
      t("settings.cat_actions"),
      groupTitle,
      t(def.labelKey),
      activeChord,
      def.defaultChord,
      "shortcut keybinding hotkey action"
    );
  });

  if (!anyVisible && !editingDef) return null;

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<Keyboard className="w-4 h-4" />}
        title={t("settings.cat_actions")}
        description={t("settings.cat_actions_desc")}
      />

      <SettingsCard title={tabGroupTitle}>
        {TAB_WINDOW_ACTION_IDS.map((id) => renderActionRow(id, tabGroupTitle))}
      </SettingsCard>

      <SettingsCard title={termGroupTitle}>
        {TERMINAL_ACTION_IDS.map((id) => renderActionRow(id, termGroupTitle))}
      </SettingsCard>

      <SettingsSectionFooter
        visible={!query.trim()}
        onResetSection={onResetSection}
      />

      <ActionModal
        isOpen={editingDef !== null}
        onClose={closeEditor}
        title={t("settings.shortcut_edit_title")}
        subtitle={editingDef ? t(editingDef.labelKey) : undefined}
        icon={<Keyboard className="h-4 w-4" />}
        iconTone="primary"
        size="sm"
        closeOnEscape={false}
        confirmLabel={t("common.save")}
        confirmVariant="primary"
        confirmDisabled={!canSaveDraft}
        onConfirm={commitDraft}
      >
        <div data-shortcut-recorder="true" className="space-y-2.5">
          <div className="flex h-12 items-center justify-center rounded-lg border border-sky-500/40 bg-slate-950 px-3">
            {draftChord ? (
              <kbd className="font-mono text-sm font-semibold text-sky-300">
                {draftChord}
              </kbd>
            ) : (
              <span className="text-xs text-slate-500">
                {t("settings.shortcut_press_keys")}
              </span>
            )}
          </div>

          {invalidAttempt ? (
            <p className="text-[11px] text-amber-400 leading-relaxed">
              {t("settings.shortcut_invalid")}
            </p>
          ) : conflictDef ? (
            <p className="text-[11px] text-rose-400 leading-relaxed">
              {t("settings.shortcut_conflict", {
                action: t(conflictDef.labelKey),
              })}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {t("settings.shortcut_hint")}
            </p>
          )}
        </div>
      </ActionModal>
    </section>
  );
};
