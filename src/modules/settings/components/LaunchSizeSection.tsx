import React from "react";
import { Check, Monitor, RotateCcw } from "lucide-react";
import {
  LAUNCH_COLS_DEFAULT,
  LAUNCH_COLS_MAX,
  LAUNCH_COLS_MIN,
  LAUNCH_ROWS_DEFAULT,
  LAUNCH_ROWS_MAX,
  LAUNCH_ROWS_MIN,
} from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { Button, Input } from "@/shared/ui";

interface LaunchSizeSectionProps {
  cols: number;
  rows: number;
  isDefaultLaunchSize: boolean;
  launchSizeResetDone: boolean;
  onChangeCols: (cols: number) => void;
  onChangeRows: (rows: number) => void;
  onResetLaunchSize: () => void;
}

export const LaunchSizeSection: React.FC<LaunchSizeSectionProps> = ({
  cols,
  rows,
  isDefaultLaunchSize,
  launchSizeResetDone,
  onChangeCols,
  onChangeRows,
  onResetLaunchSize,
}) => {
  const { t } = useI18n();

  return (
    <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-slate-200 font-semibold whitespace-nowrap">
          <Monitor className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{t("settings.launch_size")}</span>
        </div>
        <span
          title={
            isDefaultLaunchSize
              ? t("settings.reset_win_already_default", {
                  cols: LAUNCH_COLS_DEFAULT,
                  rows: LAUNCH_ROWS_DEFAULT,
                })
              : t("settings.reset_win_tooltip", {
                  cols: LAUNCH_COLS_DEFAULT,
                  rows: LAUNCH_ROWS_DEFAULT,
                })
          }
          className="inline-flex shrink-0"
        >
          <Button
            variant="outline"
            size="xs"
            disabled={isDefaultLaunchSize && !launchSizeResetDone}
            onClick={onResetLaunchSize}
            leftIcon={
              launchSizeResetDone ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )
            }
            className={
              launchSizeResetDone
                ? "!border-emerald-500/40 !bg-emerald-500/15 !text-emerald-300 hover:!bg-emerald-500/15 hover:!border-emerald-500/40 active:!bg-emerald-500/15 active:!border-emerald-500/40 active:!scale-100 !cursor-default"
                : undefined
            }
          >
            {launchSizeResetDone ? t("settings.reset_win_done") : t("settings.reset_win")}
          </Button>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          type="number"
          label={t("settings.cols")}
          min={LAUNCH_COLS_MIN}
          max={LAUNCH_COLS_MAX}
          value={cols}
          onChange={(e) => onChangeCols(Number(e.target.value))}
          className={`font-mono ${
            launchSizeResetDone
              ? "!border-emerald-500/45 hover:!border-emerald-500/60 focus:!border-sky-500"
              : ""
          }`}
        />
        <Input
          type="number"
          label={t("settings.rows")}
          min={LAUNCH_ROWS_MIN}
          max={LAUNCH_ROWS_MAX}
          value={rows}
          onChange={(e) => onChangeRows(Number(e.target.value))}
          className={`font-mono ${
            launchSizeResetDone
              ? "!border-emerald-500/45 hover:!border-emerald-500/60 focus:!border-sky-500"
              : ""
          }`}
        />
      </div>
    </div>
  );
};
