export { windowApi } from "./api/windowApi";
export { TabBar } from "./components/TabBar";
export { TabItem } from "./components/TabItem";
export { NewTabDropdown } from "./components/NewTabDropdown";
export { WindowCaptionControls } from "./components/WindowCaptionControls";
export { CommandPalette } from "./components/CommandPalette";
export { useTabDrag } from "./hooks/useTabDrag";
export { useTabsStore, type TabDisposeCallback } from "./hooks/useTabsStore";
export {
  useTabMenus,
  buildLaunchItems,
  buildSftpPanelItem,
  buildTabBarContextItems,
  buildTabBarWindowMenu,
  buildTabContextItems,
  type BuildLaunchItemsOpts,
  type BuildTabBarContextItemsOpts,
  type LocalTabLaunchOpts,
} from "./menus/tabMenus";
export { useGlobalContextMenu } from "./menus/globalMenus";
export { ShellIcon } from "./components/ShellIcon";
export {
  sftpToTabState,
  isTabConnecting,
  isTabOffline,
  createLocalTab,
  DEFAULT_LOCAL_SHELL,
} from "./utils/tabHelpers";
export type {
  AppStatusDto,
  ConflictStrategy,
  PortForwardStatusDto,
  SessionState,
  SftpConnectionState,
  ShellKind,
  ShellProfile,
  TerminalTabItem,
} from "./types";
