import React, { useEffect, useRef } from "react";
import {
  Clipboard,
  ClipboardCopy,
  Minimize2,
  Plus,
  Scissors,
  Search,
  Settings as SettingsIcon,
  TextSelect,
} from "lucide-react";
import type { ContextMenuEntry, MenuState } from "@/shared/ui";
import { copyText, readText, replaceInputSelection } from "@/shared/utils/clipboard";
import { getEditableInput } from "@/shared/utils/editableTarget";
import { getShortcutChord } from "@/shared/utils/shortcuts";
import { useSettingsStore } from "@/modules/settings/useSettingsStore";
import type { ShellProfile } from "../types";
import { buildLaunchItems, type LocalTabLaunchOpts } from "./tabMenus";

interface UseGlobalContextMenuOpts {
  t: (key: string, params?: Record<string, string | number>) => string;
  isAppElevated: boolean;
  isFullscreen?: boolean;
  shellProfiles: ShellProfile[];
  defaultShellProfile: ShellProfile | null;
  setContextMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  onNewLocalTab: (opts?: LocalTabLaunchOpts) => void;
  onNewHost: (initialGroup?: string) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onExitFullscreen?: () => void;
}

export function useGlobalContextMenu(opts: UseGlobalContextMenuOpts) {
  const {
    t,
    isAppElevated,
    isFullscreen = false,
    shellProfiles,
    defaultShellProfile,
    setContextMenu,
    onNewLocalTab,
    onNewHost,
    onOpenPalette,
    onOpenSettings,
    onExitFullscreen,
  } = opts;

  const handlerRef = useRef<(e: MouseEvent) => void>();
  handlerRef.current = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const editable = getEditableInput(target);

    if (editable) {
      const start = editable.selectionStart ?? 0;
      const end = editable.selectionEnd ?? 0;
      const selected = editable.value.slice(start, end);
      const hasSel = selected.length > 0;
      const isReadOnly = editable.readOnly || editable.disabled;
      const isPassword =
        editable instanceof HTMLInputElement && editable.type === "password";

      const items: ContextMenuEntry[] = [
        ...(!isPassword
          ? [
              {
                id: "input-cut",
                label: t("ctx.cut"),
                icon: <Scissors className="h-3.5 w-3.5" />,
                shortcut: "Ctrl+X",
                disabled: !hasSel || isReadOnly,
                onSelect: () => {
                  void copyText(selected);
                  replaceInputSelection(editable, "");
                },
              } as ContextMenuEntry,
              {
                id: "input-copy",
                label: t("ctx.copy"),
                icon: <ClipboardCopy className="h-3.5 w-3.5" />,
                shortcut: "Ctrl+C",
                disabled: !hasSel,
                onSelect: () => void copyText(selected),
              } as ContextMenuEntry,
            ]
          : []),
        {
          id: "input-paste",
          label: t("ctx.paste"),
          icon: <Clipboard className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+V",
          disabled: isReadOnly,
          onSelect: () => {
            void readText().then((txt) => {
              if (txt) replaceInputSelection(editable, txt);
            });
          },
        },
        {
          id: "input-select-all",
          label: t("ctx.select_all"),
          icon: <TextSelect className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+A",
          disabled: editable.value.length === 0,
          onSelect: () => {
            editable.focus();
            editable.select();
          },
        },
      ];
      setContextMenu({ x: e.clientX, y: e.clientY, items });
      return;
    }

    const docSelection = window.getSelection()?.toString() ?? "";
    if (
      target?.closest("[data-modal-root='true']") ||
      target?.closest("button, select, input, label")
    ) {
      setContextMenu(
        docSelection.length > 0
          ? {
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: "modal-copy",
                  label: t("ctx.copy"),
                  icon: <ClipboardCopy className="h-3.5 w-3.5" />,
                  shortcut: "Ctrl+C",
                  onSelect: () => void copyText(docSelection),
                },
              ],
            }
          : null
      );
      return;
    }

    const kb = useSettingsStore.getState().settings.keybindings;
    const items: ContextMenuEntry[] = [
      ...(docSelection.length > 0
        ? [
            {
              id: "gen-copy",
              label: t("ctx.copy"),
              icon: <ClipboardCopy className="h-3.5 w-3.5" />,
              shortcut: "Ctrl+C",
              onSelect: () => void copyText(docSelection),
            } as ContextMenuEntry,
            { type: "separator", id: "sep-gen-copy" } as ContextMenuEntry,
          ]
        : []),
      ...buildLaunchItems({
        t,
        isAppElevated,
        shellProfiles,
        defaultShellProfile,
        onNewLocalTab,
      }),
      {
        id: "gen-new-connection",
        label: t("ctx.new_connection"),
        icon: <Plus className="h-3.5 w-3.5 text-emerald-400" />,
        onSelect: () => onNewHost("Default"),
      },
      {
        id: "gen-palette",
        label: t("ctx.quick_jump"),
        icon: <Search className="h-3.5 w-3.5 text-sky-400" />,
        shortcut: getShortcutChord("commandPalette", kb),
        onSelect: onOpenPalette,
      },
      { type: "separator", id: "sep-gen-2" },
      ...(isFullscreen && onExitFullscreen
        ? [
            {
              id: "gen-exit-fullscreen",
              label: t("ctx.exit_fullscreen"),
              icon: <Minimize2 className="h-3.5 w-3.5 text-sky-400" />,
              shortcut: getShortcutChord("toggleFullscreen", kb),
              onSelect: onExitFullscreen,
            } as ContextMenuEntry,
          ]
        : []),
      {
        id: "gen-settings",
        label: t("ctx.settings"),
        icon: <SettingsIcon className="h-3.5 w-3.5 text-slate-300" />,
        shortcut: getShortcutChord("openSettings", kb),
        onSelect: onOpenSettings,
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handlerRef.current?.(e);
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
}
