export { sessionApi, detectAvailableShells } from "./api/sessionApi";
export { TerminalViewport } from "./components/TerminalViewport";
export { AuthPromptModal } from "./components/AuthPromptModal";
export { HostKeyPromptModal } from "./components/HostKeyPromptModal";
export { SecretPromptModal } from "./components/SecretPromptModal";
export { useSshSessions } from "./hooks/useSshSessions";
export { useShellsStore, resolveDefaultShell } from "./hooks/useShellsStore";
export {
  useSessionController,
  type NewLocalTabOpts,
} from "./hooks/useSessionController";
export { usePtyAuthPrompts } from "./hooks/usePtyAuthPrompts";
export {
  useTerminalSession,
  type TerminalContextActions,
} from "./hooks/useTerminalSession";
export { useTerminalMenus } from "./menus/terminalMenus";
export type {
  ConflictStrategy,
  PortForwardStatusDto,
  SessionAuthPromptEventDto,
  SessionConnectAckDto,
  SessionHostKeyPromptEventDto,
  SessionStatusEventDto,
} from "./types";
