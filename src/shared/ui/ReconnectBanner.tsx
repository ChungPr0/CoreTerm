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
      className={`absolute bottom-3 right-4 z-20 h-8 rounded-lg bg-[#161b22]/95 backdrop-blur-md shadow-2xl flex items-center overflow-hidden text-xs select-none transition-all duration-300 ease-in-out border ${
        isConnecting ? "border-sky-500/40 shadow-sky-500/10" : "border-rose-500/40 shadow-rose-500/10"
      } ${className}`}
    >
      <div
        className={`h-full flex items-center gap-1.5 text-rose-300 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${
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
        className={`h-full px-3 font-medium flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap ${
          isConnecting
            ? "bg-sky-500/15 text-sky-300 cursor-wait border-l border-sky-500/30"
            : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-l border-rose-500/30 active:brightness-95 cursor-pointer"
        }`}
      >
        <RotateCw
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${
            isConnecting ? "animate-spin text-sky-400" : "text-rose-400"
          }`}
        />
        <span>{isConnecting ? `${t("status.connecting")}...` : t("session.reconnect")}</span>
      </button>
    </div>
  );
};
