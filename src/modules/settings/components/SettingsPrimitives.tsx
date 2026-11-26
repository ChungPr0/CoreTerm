import React, { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, Input } from "@/shared/ui";

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

/** Checks whether all space-separated tokens in `query` match at least one candidate string. */
export function matchesSettingsQuery(
  query: string,
  ...candidates: Array<string | undefined>
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const haystack = normalizeSearchText(candidates.filter(Boolean).join(" "));
  const tokens = normalizeSearchText(trimmed).split(/\s+/).filter(Boolean);
  return tokens.every((tok) => haystack.includes(tok));
}

interface SettingsSectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({
  icon,
  title,
  description,
}) => {
  return (
    <div className="pb-3 border-b border-slate-800/80">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-sky-400">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
};

interface SettingsCardProps {
  title?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
  title,
  headerAction,
  children,
}) => {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  const hasVisibleChild = validChildren.some(
    (child) =>
      !(
        React.isValidElement(child) &&
        (child.props as { visible?: boolean }).visible === false
      )
  );
  if (!hasVisibleChild) return null;
  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-950/65">
      {(title || headerAction) && (
        <div className="px-4 py-2 rounded-t-xl border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between gap-2">
          {title && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {title}
            </span>
          )}
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className="divide-y divide-slate-800/70">{validChildren}</div>
    </div>
  );
};

interface SettingsRowProps {
  title: string;
  description?: string;
  visible?: boolean;
  stacked?: boolean;
  children: React.ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  title,
  description,
  visible = true,
  stacked = false,
  children,
}) => {
  if (!visible) return null;

  return (
    <div
      className={`px-4 py-3 ${
        stacked
          ? "space-y-2.5"
          : "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      }`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-xs font-medium text-slate-200">{title}</div>
        {description && (
          <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
        )}
      </div>

      <div className={stacked ? "w-full" : "shrink-0 flex items-center gap-2"}>
        {children}
      </div>
    </div>
  );
};

interface SettingsSectionFooterProps {
  visible?: boolean;
  onResetSection?: () => void;
  onRequestResetAll?: () => void;
}

export const SettingsSectionFooter: React.FC<SettingsSectionFooterProps> = ({
  visible = true,
  onResetSection,
  onRequestResetAll,
}) => {
  const { t } = useI18n();
  if (!visible || (!onResetSection && !onRequestResetAll)) return null;

  return (
    <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-end gap-2.5">
      {onResetSection && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetSection}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          {t("settings.reset_section")}
        </Button>
      )}
      {onRequestResetAll && (
        <Button
          variant="danger"
          size="sm"
          onClick={onRequestResetAll}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          {t("settings.reset_all_btn")}
        </Button>
      )}
    </div>
  );
};

interface SettingsNumberInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  clamp: (raw: unknown) => number;
  onCommit: (next: number) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
}

export function commitNumberDraft(
  draft: string,
  currentValue: number,
  clamp: (raw: unknown) => number
): { nextDraft: string; committed?: number } {
  const clamped = clamp(draft);
  return {
    nextDraft: String(clamped),
    ...(clamped !== currentValue ? { committed: clamped } : {}),
  };
}

/** Numeric input that lets the user type intermediate digits cleanly before clamping on blur/Enter. */
export const SettingsNumberInput: React.FC<SettingsNumberInputProps> = ({
  value,
  min,
  max,
  step = 1,
  clamp,
  onCommit,
  label,
  disabled = false,
  className = "",
  containerClassName = "w-28",
}) => {
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  const commitDraft = () => {
    const res = commitNumberDraft(draft, value, clamp);
    setDraft(res.nextDraft);
    if (res.committed !== undefined) {
      onCommit(res.committed);
    }
  };

  return (
    <Input
      type="number"
      label={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitDraft();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      className={`font-mono ${className}`}
      containerClassName={containerClassName}
    />
  );
};
