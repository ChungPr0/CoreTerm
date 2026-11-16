import React from "react";
import {
  Box,
  GitBranch,
  Shield,
  SquareTerminal,
  Terminal as TerminalIcon,
} from "lucide-react";
import type { ShellProfile } from "@/shared/types/ipc";

interface ShellIconProps {
  profile?: Pick<ShellProfile, "kind">;
  isAdmin?: boolean;
  className?: string;
}

export const ShellIcon: React.FC<ShellIconProps> = ({
  profile,
  isAdmin = false,
  className = "w-3.5 h-3.5 shrink-0",
}) => {
  if (isAdmin) {
    return <Shield className={`${className} text-amber-400`} />;
  }

  switch (profile?.kind) {
    case "pwsh":
      return <TerminalIcon className={`${className} text-indigo-400`} />;
    case "cmd":
      return <SquareTerminal className={`${className} text-slate-300`} />;
    case "git-bash":
      return <GitBranch className={`${className} text-orange-400`} />;
    case "wsl":
      return <Box className={`${className} text-emerald-400`} />;
    case "powershell":
    default:
      return <TerminalIcon className={`${className} text-sky-400`} />;
  }
};
