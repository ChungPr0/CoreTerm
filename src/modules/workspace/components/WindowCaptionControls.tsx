import React from "react";
import { Minus, Square, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { windowApi } from "../api/windowApi";

export const WindowCaptionControls: React.FC = () => {
  const { t } = useI18n();

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="flex items-center h-full shrink-0"
    >
      <button
        type="button"
        onClick={() => windowApi.windowMinimize().catch(() => {})}
        title={t("window.minimize")}
        className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => windowApi.windowToggleMaximize().catch(() => {})}
        title={t("window.maximize")}
        className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
      >
        <Square className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => windowApi.windowClose().catch(() => {})}
        title={`${t("window.close")} (Alt+F4)`}
        className="h-full w-11 flex items-center justify-center text-slate-400 hover:bg-rose-600 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
