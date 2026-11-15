import React from "react";
import { Check, Copy, Star, Trash2 } from "lucide-react";
import type { SshKeyDto } from "../types";
import { useI18n } from "@/shared/i18n";

interface KeyCardListProps {
  keys: SshKeyDto[];
  copiedId: string | null;
  onToggleDefault: (key: SshKeyDto) => void;
  onCopyPub: (key: SshKeyDto) => void;
  onRequestDelete: (key: SshKeyDto) => void;
}

export const KeyCardList: React.FC<KeyCardListProps> = ({
  keys,
  copiedId,
  onToggleDefault,
  onCopyPub,
  onRequestDelete,
}) => {
  const { t } = useI18n();

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">{t("vault.title")}</span>
        {keys.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
            {keys.length}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {keys.length === 0 ? (
          <div className="py-6 text-center text-slate-500">{t("vault.empty")}</div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-100 truncate">{k.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-sky-300">
                      {k.key_type}
                    </span>
                    {k.is_default && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                        {t("vault.default")}
                      </span>
                    )}
                    {!k.file_exists && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">
                        {t("vault.file_missing")}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                    {k.fingerprint}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleDefault(k)}
                    title={t("vault.set_default")}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
                      k.is_default
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </button>

                  {k.public_key_content && (
                    <button
                      type="button"
                      onClick={() => onCopyPub(k)}
                      className="inline-flex h-7 items-center gap-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      {copiedId === k.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{t("common.copied")}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t("vault.copy_pub")}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                <div className="text-[10px] text-slate-500 font-mono truncate min-w-0 flex-1">
                  {k.private_key_path}
                </div>

                <button
                  type="button"
                  onClick={() => onRequestDelete(k)}
                  title={t("common.delete")}
                  className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-slate-900 hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-[11px] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t("common.delete")}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
};
