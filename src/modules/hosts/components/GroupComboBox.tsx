import React, { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { PopoverMenu } from "@/shared/ui";

interface GroupComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  existingGroups: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GroupComboBox: React.FC<GroupComboBoxProps> = ({
  value,
  onChange,
  existingGroups,
  isOpen,
  onOpenChange,
}) => {
  const { t } = useI18n();
  const comboRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={comboRef} className="relative">
      <label className="block text-slate-300 font-medium mb-1">{t("host.group")}</label>
      <div className="flex items-center h-8 rounded-lg bg-slate-950 border border-slate-800 focus-within:border-sky-500/70 transition-colors">
        <input
          type="text"
          value={value}
          maxLength={64}
          placeholder={t("host.group_placeholder")}
          onFocus={() => onOpenChange(true)}
          onClick={() => onOpenChange(true)}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) onOpenChange(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isOpen) {
              e.preventDefault();
              onOpenChange(false);
            } else if (e.key === "ArrowDown") {
              onOpenChange(true);
            } else if (e.key === "Tab") {
              onOpenChange(false);
            }
          }}
          className="flex-1 min-w-0 h-full px-3 bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onOpenChange(!isOpen)}
          className="h-full px-2 flex items-center justify-center text-slate-400 hover:text-slate-200 shrink-0 transition-colors"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              isOpen ? "rotate-180 text-sky-400" : ""
            }`}
          />
        </button>
      </div>

      <PopoverMenu
        isOpen={isOpen && existingGroups.length > 0}
        onClose={() => onOpenChange(false)}
        anchorRef={comboRef}
        className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg bg-slate-900 border border-slate-700/90 shadow-2xl py-1 max-h-48 overflow-y-auto select-none"
      >
        {existingGroups.map((g) => {
          const isSelected = g.trim().toLowerCase() === value.trim().toLowerCase();
          return (
            <button
              key={g}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(g);
                onOpenChange(false);
              }}
              className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
                isSelected
                  ? "bg-sky-500/15 text-sky-300 font-medium"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{g}</span>
              {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
            </button>
          );
        })}
      </PopoverMenu>
    </div>
  );
};
