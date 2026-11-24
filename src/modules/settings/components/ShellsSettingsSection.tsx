import React, { useMemo, useState } from "react";
import { RefreshCw, Terminal as TerminalIcon } from "lucide-react";
import { DEFAULT_SHELL_ID } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import type { ShellProfile } from "@/shared/types/ipc";
import { Button, ShellIcon } from "@/shared/ui";
import {
  formatShellArgs,
  mergeShells,
  resolveDefaultShell,
  useShellsStore,
} from "@/modules/terminal/hooks/useShellsStore";
import type { AppSettingsValues } from "../types";
import { CustomShellsSection } from "./CustomShellsSection";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface ShellsSettingsSectionProps {
  settings: AppSettingsValues;
  shellProfiles: ShellProfile[];
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onRequestDeleteShell: (shell: ShellProfile) => void;
  onResetSection?: () => void;
}

export const ShellsSettingsSection: React.FC<ShellsSettingsSectionProps> = ({
  settings,
  shellProfiles,
  query,
  onPatch,
  onRequestDeleteShell,
  onResetSection,
}) => {
  const { t } = useI18n();
  const detectedFromStore = useShellsStore((s) => s.shells);
  const detectShells = useShellsStore((s) => s.detectShells);
  const [isScanning, setIsScanning] = useState(false);

  const systemShells = useMemo(() => {
    if (detectedFromStore.length > 0) return detectedFromStore;
    const savedCustomIds = new Set((settings.customShells ?? []).map((c) => c.id));
    return shellProfiles.filter((s) => !savedCustomIds.has(s.id));
  }, [detectedFromStore, shellProfiles, settings.customShells]);

  const availableShells = useMemo(
    () => mergeShells(systemShells, settings.customShells ?? []),
    [systemShells, settings.customShells]
  );

  const effectiveDefaultShell = useMemo(
    () => resolveDefaultShell(availableShells, settings.defaultShellId || DEFAULT_SHELL_ID),
    [availableShells, settings.defaultShellId]
  );

  const handleSelectDefaultShell = (id: string) => {
    const profile = availableShells.find((s) => s.id === id);
    onPatch({
      defaultShellId: profile?.id ?? id,
      defaultShellProfile: profile,
    });
  };

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      await detectShells(true);
    } finally {
      setIsScanning(false);
    }
  };

  const showDetectedShells = matchesSettingsQuery(
    query,
    t("settings.cat_shells"),
    t("settings.detected_shells"),
    t("app.rescan"),
    t("settings.set_as_default"),
    t("app.default_badge"),
    ...systemShells.map((s) => `${s.name} ${s.executable}`)
  );
  const showCustomShells = matchesSettingsQuery(
    query,
    t("settings.cat_shells"),
    t("settings.custom_shells"),
    t("settings.custom_shells_hint"),
    t("settings.shell_add"),
    t("settings.set_as_default"),
    t("app.default_badge"),
    ...(settings.customShells ?? []).map((s) => `${s.name} ${s.executable}`)
  );

  if (!showDetectedShells && !showCustomShells) {
    return null;
  }

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<TerminalIcon className="w-4 h-4" />}
        title={t("settings.cat_shells")}
        description={t("settings.cat_shells_desc")}
      />

      {showDetectedShells && (
        <SettingsCard
          title={t("settings.detected_shells")}
          headerAction={
            <Button
              variant="outline"
              size="xs"
              loading={isScanning}
              onClick={() => void handleRescan()}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              {t("app.rescan")}
            </Button>
          }
        >
          {systemShells.length === 0 ? (
            <div className="px-4 py-4 text-center text-[11px] text-slate-500">
              {t("settings.no_shells")}
            </div>
          ) : (
            systemShells.map((shell) => {
              const isDefault = effectiveDefaultShell?.id === shell.id;
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
                        title={detail}
                        className="h-4 leading-4 text-[11px] font-mono text-slate-500 truncate"
                      >
                        {detail}
                      </div>
                    </div>
                  </div>

                  {!isDefault && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleSelectDefaultShell(shell.id)}
                      className="shrink-0"
                    >
                      {t("settings.set_as_default")}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </SettingsCard>
      )}

      {showCustomShells && (
        <CustomShellsSection
          fullHeight
          customShells={settings.customShells ?? []}
          effectiveDefaultShellId={effectiveDefaultShell?.id}
          onSelectDefault={(shell) => handleSelectDefaultShell(shell.id)}
          onChange={(nextCustom) => {
            const nextAvail = mergeShells(systemShells, nextCustom);
            const resolved = resolveDefaultShell(
              nextAvail,
              settings.defaultShellId || DEFAULT_SHELL_ID
            );
            onPatch({
              customShells: nextCustom,
              defaultShellId: resolved?.id ?? DEFAULT_SHELL_ID,
              defaultShellProfile: resolved ?? undefined,
            });
          }}
          onFirstAdd={(profile) => {
            if (availableShells.length === 0) {
              onPatch({
                defaultShellId: profile.id,
                defaultShellProfile: profile,
              });
            }
          }}
          onRequestDelete={onRequestDeleteShell}
        />
      )}

      <SettingsSectionFooter
        visible={!query.trim()}
        onResetSection={onResetSection}
      />
    </section>
  );
};
