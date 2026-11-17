import React from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";

export interface ReconnectBannerProps {
  isDisconnected: boolean;
  isConnecting: boolean;
  onReconnect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

export const ReconnectBanner: React.FC<ReconnectBannerProps> = ({
  isDisconnected,
  isConnecting,
  onReconnect,
  onContextMenu,
  className = "",
}) => {
  const { t } = useI18n();

  if (!isDisconnected && !isConnecting) return null;

  return (
    <div
      onContextMenu={onContextMenu}
      className={`absolute bottom-3 right-4 z-20 h-8 rounded-lg bg-slate-900/95 backdrop-blur-md shadow-xl flex items-center overflow-hidden text-xs select-none transition-all duration-300 ease-in-out border ${
        isConnecting ? "border-amber-500/40" : "border-rose-500/40"
      } ${className}`}
    >
      <div
        className={`h-full flex items-center gap-1.5 text-rose-200 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${
          isConnecting
            ? "max-w-0 opacity-0 px-0 pointer-events-none"
            : "max-w-[150px] opacity-100 pl-2.5 pr-2"
        }`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span className="font-medium">{t("status.disconnected")}</span>
      </div>

      <button
        type="button"
        onClick={onReconnect}
        disabled={isConnecting}
        className={`h-full px-2.5 font-medium text-white flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap ${
          isConnecting
            ? "bg-amber-600/90 text-amber-100 cursor-wait"
            : "bg-rose-600 hover:bg-rose-500 active:brightness-95 cursor-pointer"
        }`}
      >
        <RotateCw
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
            isConnecting ? "animate-spin" : ""
          }`}
        />
        <span>{isConnecting ? `${t("status.connecting")}...` : t("session.reconnect")}</span>
      </button>
    </div>
  );
};
