import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  FileCode2,
  FolderSync,
  Rocket,
  RotateCcw,
  Search,
  Shield,
  Sliders,
  Terminal as TerminalIcon,
  TerminalSquare,
  X,
} from "lucide-react";
import { DEFAULT_SHELL_ID } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import type {
  SettingsCategoryId,
  ShellProfile,
  TerminalTabItem,
} from "@/shared/types/ipc";
import {
  ActionModal,
  Button,
  ConfirmDeleteModal,
  IconButton,
  Input,
} from "@/shared/ui";
import {
  formatShellArgs,
  mergeShells,
  resolveDefaultShell,
  useShellsStore,
} from "@/modules/terminal/hooks/useShellsStore";
import { useTabsStore } from "@/modules/workspace/hooks/useTabsStore";
import { windowApi } from "@/modules/workspace/api/windowApi";
import { useSettingsStore } from "../useSettingsStore";
import { EditorSettingsSection } from "./EditorSettingsSection";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { matchesSettingsQuery } from "./SettingsPrimitives";
import { SftpSettingsSection } from "./SftpSettingsSection";
import { ShellsSettingsSection } from "./ShellsSettingsSection";
import { SshSettingsSection } from "./SshSettingsSection";
import { StartupSettingsSection } from "./StartupSettingsSection";
import { TerminalSettingsSection } from "./TerminalSettingsSection";

interface SettingsTabPaneProps {
  tab: TerminalTabItem;
  isActive: boolean;
  shellProfiles: ShellProfile[];
  findToken?: number;
  onOpenVault?: () => void;
  onModalChange?: (tabId: string, open: boolean) => void;
}

type ResetPromptState =
  | { scope: "all" }
  | { scope: "section"; category: SettingsCategoryId; label: string }
  | null;

interface CategoryDef {
  id: SettingsCategoryId;
  labelKey: string;
  icon: React.ReactNode;
}

const CATEGORIES: CategoryDef[] = [
  { id: "general", labelKey: "settings.cat_general", icon: <Sliders className="w-3.5 h-3.5" /> },
  { id: "startup", labelKey: "settings.cat_startup", icon: <Rocket className="w-3.5 h-3.5" /> },
  { id: "terminal", labelKey: "settings.cat_terminal", icon: <TerminalSquare className="w-3.5 h-3.5" /> },
  { id: "shells", labelKey: "settings.cat_shells", icon: <TerminalIcon className="w-3.5 h-3.5" /> },
  { id: "ssh", labelKey: "settings.cat_ssh", icon: <Shield className="w-3.5 h-3.5" /> },
  { id: "sftp", labelKey: "settings.cat_sftp", icon: <FolderSync className="w-3.5 h-3.5" /> },
  { id: "editor", labelKey: "settings.cat_editor", icon: <FileCode2 className="w-3.5 h-3.5" /> },
];

export const SettingsTabPane: React.FC<SettingsTabPaneProps> = ({
  tab,
  isActive,
  shellProfiles,
  findToken = 0,
  onOpenVault,
  onModalChange,
}) => {
  const { t } = useI18n();
  const settings = useSettingsStore((s) => s.settings);
  const patchSettings = useSettingsStore((s) => s.patchSettings);
  const resetCategorySettings = useSettingsStore((s) => s.resetCategorySettings);
  const resetAllSettings = useSettingsStore((s) => s.resetAllSettings);
  const detectedFromStore = useShellsStore((s) => s.shells);

  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(
    tab.settingsSection ?? "general"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingShell, setDeletingShell] = useState<ShellProfile | null>(null);
  const [resetPrompt, setResetPrompt] = useState<ResetPromptState>(null);
  const [resetSeq, setResetSeq] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const prevFindTokenRef = useRef(findToken);

  useEffect(() => {
    if (tab.settingsSection) {
      setActiveCategory(tab.settingsSection);
      setSearchQuery("");
      contentScrollRef.current?.scrollTo({ top: 0 });
    }
  }, [tab.settingsSection]);

  useEffect(() => {
    if (findToken > prevFindTokenRef.current) {
      prevFindTokenRef.current = findToken;
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [findToken]);

  const hasChildModal = isActive && (deletingShell !== null || resetPrompt !== null);
  useEffect(() => {
    onModalChange?.(tab.tabId, hasChildModal);
    return () => {
      onModalChange?.(tab.tabId, false);
    };
  }, [hasChildModal, onModalChange, tab.tabId]);

  const selectCategory = (cat: SettingsCategoryId) => {
    setActiveCategory(cat);
    setSearchQuery("");
    useTabsStore.getState().setSettingsSection(tab.tabId, cat);
    contentScrollRef.current?.scrollTo({ top: 0 });
  };

  const isSearching = searchQuery.trim().length > 0;

  const matchingCategoryIds = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return new Set<SettingsCategoryId>([activeCategory]);

    const systemShells =
      detectedFromStore.length > 0
        ? detectedFromStore
        : shellProfiles.filter(
            (s) => !(settings.customShells ?? []).some((c) => c.id === s.id)
          );
    const availableShells = mergeShells(systemShells, settings.customShells ?? []);

    const matched = new Set<SettingsCategoryId>();
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_general"),
        t("settings.lang"),
        t("settings.lang_desc"),
        t("settings.lang_system"),
        t("settings.lang_vi"),
        t("settings.lang_en"),
        t("settings.context_menu_title"),
        t("settings.context_menu_desc"),
        t("settings.close_last_tab"),
        t("settings.close_last_tab_desc"),
        t("settings.reset_section"),
        t("settings.reset_all_btn"),
        "explorer reset language"
      )
    ) {
      matched.add("general");
    }
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_startup"),
        t("settings.cat_startup_desc"),
        t("settings.launch_on_startup"),
        t("settings.launch_on_startup_desc"),
        t("settings.startup_behavior"),
        t("settings.startup_default_profile"),
        t("settings.startup_restore_session"),
        t("settings.new_instance"),
        t("settings.ime_mode"),
        t("settings.launch_size"),
        t("settings.launch_mode"),
        t("settings.cols"),
        t("settings.rows"),
        t("settings.center_on_launch"),
        t("settings.always_on_top"),
        "startup window size ime fullscreen maximized always on top"
      )
    ) {
      matched.add("startup");
    }
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_terminal"),
        t("settings.term_font_family"),
        t("settings.term_font_size"),
        t("settings.term_line_height"),
        t("settings.term_cursor_style"),
        t("settings.term_cursor_blink"),
        t("settings.term_scrollback"),
        t("settings.term_copy_on_select"),
        t("settings.term_right_click_paste"),
        t("settings.term_webgl"),
        "font size buffer clipboard gpu"
      )
    ) {
      matched.add("terminal");
    }
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_shells"),
        t("settings.set_as_default"),
        t("app.default_badge"),
        t("settings.detected_shells"),
        t("settings.custom_shells"),
        t("settings.shell_add"),
        t("app.rescan"),
        ...availableShells.map((s) => `${s.name} ${s.executable}`)
      )
    ) {
      matched.add("shells");
    }
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_ssh"),
        t("settings.ssh_default_username"),
        t("settings.ssh_default_port"),
        t("settings.ssh_default_keepalive"),
        t("settings.ssh_default_host_checking"),
        t("settings.ssh_default_compression"),
        t("settings.ssh_default_forward_agent"),
        t("settings.ssh_default_auto_reconnect"),
        t("settings.ssh_default_reconnect_interval"),
        t("vault.title")
      )
    ) {
      matched.add("ssh");
    }
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_sftp"),
        t("settings.sftp_conflict_policy"),
        t("settings.sftp_show_hidden"),
        t("settings.sftp_show_local_split"),
        t("settings.sftp_confirm_transfer"),
        t("settings.sftp_double_click")
      )
    ) {
      matched.add("sftp");
    }
    if (
      matchesSettingsQuery(
        q,
        t("settings.cat_editor"),
        t("settings.editor_font_size"),
        t("settings.editor_tab_size"),
        t("settings.editor_word_wrap"),
        t("settings.editor_line_numbers"),
        t("settings.editor_active_line")
      )
    ) {
      matched.add("editor");
    }
    return matched;
  }, [
    activeCategory,
    detectedFromStore,
    searchQuery,
    settings.customShells,
    shellProfiles,
    t,
  ]);

  const handleConfirmDeleteShell = () => {
    if (!deletingShell) return;
    const nextCustom = (settings.customShells ?? []).filter(
      (c) => c.id !== deletingShell.id
    );
    const systemShells =
      detectedFromStore.length > 0
        ? detectedFromStore
        : shellProfiles.filter(
            (s) => !(settings.customShells ?? []).some((c) => c.id === s.id)
          );
    const nextAvail = mergeShells(systemShells, nextCustom);
    const wasDefault = settings.defaultShellId === deletingShell.id;
    const resolved = resolveDefaultShell(
      nextAvail,
      wasDefault ? DEFAULT_SHELL_ID : settings.defaultShellId
    );
    patchSettings({
      customShells: nextCustom,
      defaultShellId: resolved?.id ?? DEFAULT_SHELL_ID,
      defaultShellProfile: resolved ?? undefined,
    });
    setDeletingShell(null);
  };

  const handleConfirmReset = () => {
    if (!resetPrompt) return;
    if (resetPrompt.scope === "all") {
      resetAllSettings();
      windowApi.startupSetEnabled(false).catch(() => {});
      setResetSeq((n) => n + 1);
    } else {
      resetCategorySettings(resetPrompt.category);
      if (resetPrompt.category === "startup") {
        windowApi.startupSetEnabled(false).catch(() => {});
        setResetSeq((n) => n + 1);
      }
    }
    setResetPrompt(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-[#0c0f14] text-xs text-slate-200 select-none">
      {/* Category Sidebar with Integrated Search */}
      <aside className="w-52 sm:w-56 shrink-0 border-r border-[#21262d] bg-[#0d1117] flex flex-col min-h-0">
        <div className="p-2.5 border-b border-[#21262d]/80 shrink-0">
          <Input
            ref={searchInputRef}
            type="text"
            inputSize="sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchQuery) {
                e.preventDefault();
                e.stopPropagation();
                setSearchQuery("");
              }
            }}
            placeholder={t("settings.search_placeholder")}
            leftIcon={<Search className="w-3.5 h-3.5 text-slate-500" />}
            rightIcon={
              searchQuery ? (
                <IconButton
                  size="xs"
                  onClick={() => setSearchQuery("")}
                  title={t("common.close")}
                  icon={<X className="w-3 h-3" />}
                />
              ) : undefined
            }
          />
        </div>

        <nav
          aria-label={t("settings.title")}
          className="flex-1 overflow-y-auto py-2.5 pl-2.5 pr-[5px] space-y-1"
        >
          {CATEGORIES.map((cat) => {
            const isSelected = !isSearching && activeCategory === cat.id;
            const isMatchedInSearch = isSearching && matchingCategoryIds.has(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategory(cat.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs font-medium border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                    : isMatchedInSearch
                      ? "bg-slate-900/80 text-slate-200 border-slate-800 hover:bg-slate-800/80"
                      : "bg-transparent text-slate-400 border-transparent hover:bg-slate-900/70 hover:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className={isSelected ? "text-sky-400" : "text-slate-400"}>
                    {cat.icon}
                  </span>
                  <span className="truncate">{t(cat.labelKey)}</span>
                </span>
                {isMatchedInSearch && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Scrollable Content */}
      <div
        ref={contentScrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-5 pl-5 pr-[15px] sm:py-6 sm:pl-6 sm:pr-[19px]"
      >
        <div className="mx-auto max-w-3xl space-y-8 pb-6">
            {isSearching && matchingCategoryIds.size === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <Search className="w-7 h-7 text-slate-600" />
                <p className="text-slate-400">{t("settings.search_empty")}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                >
                  {t("settings.search_clear")}
                </Button>
              </div>
            ) : (
              <>
                {(isSearching || activeCategory === "general") && (
                  <GeneralSettingsSection
                    settings={settings}
                    query={searchQuery}
                    onPatch={patchSettings}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "general",
                        label: t("settings.cat_general"),
                      })
                    }
                    onRequestResetAll={() => setResetPrompt({ scope: "all" })}
                  />
                )}

                {(isSearching || activeCategory === "startup") && (
                  <StartupSettingsSection
                    settings={settings}
                    query={searchQuery}
                    resetSeq={resetSeq}
                    onPatch={patchSettings}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "startup",
                        label: t("settings.cat_startup"),
                      })
                    }
                  />
                )}

                {(isSearching || activeCategory === "terminal") && (
                  <TerminalSettingsSection
                    settings={settings}
                    query={searchQuery}
                    onPatch={patchSettings}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "terminal",
                        label: t("settings.cat_terminal"),
                      })
                    }
                  />
                )}

                {(isSearching || activeCategory === "shells") && (
                  <ShellsSettingsSection
                    settings={settings}
                    shellProfiles={shellProfiles}
                    query={searchQuery}
                    onPatch={patchSettings}
                    onRequestDeleteShell={setDeletingShell}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "shells",
                        label: t("settings.cat_shells"),
                      })
                    }
                  />
                )}

                {(isSearching || activeCategory === "ssh") && (
                  <SshSettingsSection
                    settings={settings}
                    query={searchQuery}
                    onPatch={patchSettings}
                    onOpenVault={onOpenVault}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "ssh",
                        label: t("settings.cat_ssh"),
                      })
                    }
                  />
                )}

                {(isSearching || activeCategory === "sftp") && (
                  <SftpSettingsSection
                    settings={settings}
                    query={searchQuery}
                    onPatch={patchSettings}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "sftp",
                        label: t("settings.cat_sftp"),
                      })
                    }
                  />
                )}

                {(isSearching || activeCategory === "editor") && (
                  <EditorSettingsSection
                    settings={settings}
                    query={searchQuery}
                    onPatch={patchSettings}
                    onResetSection={() =>
                      setResetPrompt({
                        scope: "section",
                        category: "editor",
                        label: t("settings.cat_editor"),
                      })
                    }
                  />
                )}
              </>
            )}
          </div>
      </div>

      <ConfirmDeleteModal
        isOpen={deletingShell !== null}
        title={t("settings.shell_delete_title")}
        itemName={deletingShell?.name ?? ""}
        itemDetail={
          deletingShell
            ? formatShellArgs(deletingShell.args)
              ? `${deletingShell.executable} ${formatShellArgs(deletingShell.args)}`
              : deletingShell.executable
            : undefined
        }
        onCancel={() => setDeletingShell(null)}
        onConfirm={handleConfirmDeleteShell}
      />

      <ActionModal
        isOpen={resetPrompt !== null}
        onClose={() => setResetPrompt(null)}
        title={
          resetPrompt?.scope === "all"
            ? t("settings.reset_all_confirm_title")
            : t("settings.reset_section_confirm_title")
        }
        subtitle={resetPrompt?.scope === "section" ? resetPrompt.label : undefined}
        icon={<AlertTriangle className="h-4 w-4" />}
        iconTone="warning"
        size="sm"
        confirmLabel={t("settings.reset_confirm_btn")}
        confirmVariant="danger"
        confirmIcon={<RotateCcw className="h-3.5 w-3.5" />}
        onConfirm={handleConfirmReset}
      >
        <p className="text-xs text-slate-300 leading-relaxed">
          {resetPrompt?.scope === "all"
            ? t("settings.reset_all_confirm_desc")
            : t("settings.reset_section_confirm_desc")}
        </p>
      </ActionModal>
    </div>
  );
};
