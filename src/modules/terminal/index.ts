export { sessionApi, detectAvailableShells } from "./api/sessionApi";
export { TerminalViewport } from "./components/TerminalViewport";
export { AuthPromptModal } from "./components/AuthPromptModal";
export { HostKeyPromptModal } from "./components/HostKeyPromptModal";
export { SecretPromptModal } from "./components/SecretPromptModal";
export { useSshSessions } from "./hooks/useSshSessions";
export {
  useShellsStore,
  resolveDefaultShell,
  mergeShells,
  parseShellArgs,
  formatShellArgs,
  shellNameFromPath,
  makeCustomShell,
} from "./hooks/useShellsStore";
export {
  useSessionController,
  type NewLocalTabOpts,
} from "./hooks/useSessionController";
export { usePtyAuthPrompts } from "./hooks/usePtyAuthPrompts";
export {
  useTerminalSession,
  type LaunchWinSize,
  type TerminalContextActions,
} from "./hooks/useTerminalSession";
export { calcWinSize } from "./hooks/terminalHelpers";
export { useTerminalMenus } from "./menus/terminalMenus";
export type {
  ConflictStrategy,
  PortForwardStatusDto,
  SessionAuthPromptEventDto,
  SessionConnectAckDto,
  SessionHostKeyPromptEventDto,
  SessionStatusEventDto,
} from "./types";
