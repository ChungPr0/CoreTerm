import React from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";

export interface ReconnectBannerProps {
  isDisconnected: boolean;
  isConnecting: boolean;
  isAutoReconnect?: boolean;
  onReconnect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

export const ReconnectBanner: React.FC<ReconnectBannerProps> = ({
  isDisconnected,
  isConnecting,
  isAutoReconnect = false,
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
      {isConnecting ? (
        <div className="h-full px-3 font-medium flex items-center gap-1.5 bg-sky-500/15 text-sky-300 whitespace-nowrap">
          <RotateCw className="w-3.5 h-3.5 shrink-0 animate-spin text-sky-400" />
          <span>{`${t("status.connecting")}...`}</span>
        </div>
      ) : (
        <>
          <div className="h-full flex items-center gap-1.5 text-rose-300 px-3 whitespace-nowrap">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="font-medium">{t("status.disconnected")}</span>
          </div>

          {!isAutoReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              className="h-full px-3 font-medium flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border-l border-rose-500/30 active:brightness-95 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span>{t("session.reconnect")}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
