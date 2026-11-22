import React from "react";
import { FindBar } from "@/shared/ui";

interface TerminalFindBarProps {
  isOpen: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onChangeQuery: (value: string) => void;
  caseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  regex: boolean;
  onToggleRegex: () => void;
  invalidRegex: boolean;
  matches: { index: number; count: number };
  onFindPrev: () => void;
  onFindNext: () => void;
  onClose: () => void;
}

export const TerminalFindBar: React.FC<TerminalFindBarProps> = (props) => (
  <FindBar {...props} allowReplace={false} />
);
