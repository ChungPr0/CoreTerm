import React from "react";
import { Copy, Minimize2, Minus, Square, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { windowApi } from "../api/windowApi";

interface WindowCaptionControlsProps {
  isFullscreen?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onExitFullscreen?: () => void;
  onCloseWindow?: () => void;
}

export const WindowCaptionControls: React.FC<WindowCaptionControlsProps> = ({
  isFullscreen = false,
  isMaximized = false,
  onToggleMaximize,
  onExitFullscreen,
  onCloseWindow,
}) => {
  const { t } = useI18n();

  const handleMiddleAction = () => {
    if (isFullscreen && onExitFullscreen) {
      onExitFullscreen();
      return;
    }
    if (onToggleMaximize) {
      onToggleMaximize();
      return;
    }
    windowApi.windowToggleMaximize().catch(() => {});
  };

  const middleTitle = isFullscreen
    ? t("ctx.exit_fullscreen")
    : isMaximized
      ? t("window.restore")
      : t("window.maximize");

  return (
    <div
      data-window-caption="true"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="flex items-center h-full shrink-0"
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={() => windowApi.windowMinimize().catch(() => {})}
        data-tooltip={t("window.minimize")}
        data-tooltip-placement="bottom"
        aria-label={t("window.minimize")}
        className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={handleMiddleAction}
        data-tooltip={middleTitle}
        data-tooltip-placement="bottom"
        aria-label={middleTitle}
        className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        {isFullscreen ? (
          <Minimize2 className="w-3.5 h-3.5" />
        ) : isMaximized ? (
          <Copy className="w-3 h-3 -scale-x-100" />
        ) : (
          <Square className="w-3 h-3" />
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          if (onCloseWindow) {
            onCloseWindow();
          } else {
            windowApi.windowClose().catch(() => {});
          }
        }}
        data-tooltip={`${t("window.close")} (Alt+F4)`}
        data-tooltip-placement="bottom"
        aria-label={`${t("window.close")} (Alt+F4)`}
        className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-rose-600 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
