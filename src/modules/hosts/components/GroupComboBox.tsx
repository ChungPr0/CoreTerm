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
  const optionElsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const stepGroup = (delta: 1 | -1) => {
    if (existingGroups.length === 0) return;
    if (!isOpen) onOpenChange(true);
    const curIdx = existingGroups.findIndex(
      (g) => g.trim().toLowerCase() === value.trim().toLowerCase()
    );
    const nextIdx =
      curIdx < 0
        ? delta > 0
          ? 0
          : existingGroups.length - 1
        : Math.max(0, Math.min(existingGroups.length - 1, curIdx + delta));
    onChange(existingGroups[nextIdx]);
    window.requestAnimationFrame(() => {
      optionElsRef.current[nextIdx]?.scrollIntoView({ block: "nearest" });
    });
  };

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
          } else if (e.key === "Escape" && isOpen) {
            e.preventDefault();
            e.stopPropagation();
            onOpenChange(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            stepGroup(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            stepGroup(-1);
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
        portal
        matchAnchorWidth
        maxHeightPx={192}
        className="z-[90] rounded-lg bg-slate-900 border border-slate-700/90 shadow-2xl py-1 overflow-y-auto select-none"
      >
        {existingGroups.map((g, idx) => {
          const isSelected = g.trim().toLowerCase() === value.trim().toLowerCase();
          return (
            <button
              key={g}
              ref={(el) => {
                optionElsRef.current[idx] = el;
              }}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(g);
                onOpenChange(false);
              }}
              className={`w-full pl-3 pr-[7px] py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
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
