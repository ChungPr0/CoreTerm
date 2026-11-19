import React, { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { IconButton, Input, PopoverMenu } from "@/shared/ui";

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
      <Input
        label={t("host.group")}
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
        rightIcon={
          <IconButton
            size="xs"
            tone="sky"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onOpenChange(!isOpen)}
            icon={
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isOpen ? "rotate-180 text-sky-400" : ""
                }`}
              />
            }
          />
        }
      />

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
