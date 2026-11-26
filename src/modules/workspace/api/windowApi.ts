import { invoke } from "@/shared/api/tauriClient";
import type { DefaultImeMode, LaunchMode, NewInstanceBehavior } from "@/modules/settings/types";
import type { AppStatusDto } from "../types";

export type WindowSysAction =
  | "restore"
  | "move"
  | "size"
  | "minimize"
  | "maximize"
  | "close";

export const windowApi = {
  appGetStatus(): Promise<AppStatusDto> {
    return invoke<AppStatusDto>("app_get_status", {});
  },

  startupGetStatus(): Promise<boolean> {
    return invoke<boolean>("startup_get_status", {});
  },

  startupSetEnabled(enabled: boolean): Promise<boolean> {
    return invoke<boolean>("startup_set_enabled", { enabled });
  },

  startupSyncPrefs(newInstanceBehavior: NewInstanceBehavior): Promise<void> {
    return invoke<void>("startup_sync_prefs", {
      new_instance_behavior: newInstanceBehavior,
    });
  },

  clipboardReadText(): Promise<string> {
    return invoke<string>("clipboard_read_text", {});
  },

  clipboardWriteText(text: string): Promise<void> {
    return invoke<void>("clipboard_write_text", { text });
  },

  windowSetLaunchSize(
    cols: number,
    rows: number,
    width?: number,
    height?: number
  ): Promise<void> {
    return invoke<void>("window_set_launch_size", {
      cols,
      rows,
      width: width ?? null,
      height: height ?? null,
    });
  },

  windowPresent(params?: {
    cols?: number;
    rows?: number;
    width?: number;
    height?: number;
    launchMode?: LaunchMode;
    centerOnLaunch?: boolean;
    alwaysOnTop?: boolean;
  }): Promise<void> {
    return invoke<void>("window_present", {
      cols: params?.cols ?? null,
      rows: params?.rows ?? null,
      width: params?.width ?? null,
      height: params?.height ?? null,
      launch_mode: params?.launchMode ?? null,
      center_on_launch: params?.centerOnLaunch ?? null,
      always_on_top: params?.alwaysOnTop ?? null,
    });
  },

  windowSetAlwaysOnTop(enabled: boolean): Promise<void> {
    return invoke<void>("window_set_always_on_top", { enabled });
  },

  windowToggleFullscreen(): Promise<boolean> {
    return invoke<boolean>("window_toggle_fullscreen", {});
  },

  windowIsFullscreen(): Promise<boolean> {
    return invoke<boolean>("window_is_fullscreen", {});
  },

  windowSetTitle(title: string): Promise<void> {
    return invoke<void>("window_set_title", { title });
  },

  windowApplyImeMode(mode: DefaultImeMode): Promise<void> {
    return invoke<void>("window_apply_ime_mode", { mode });
  },

  windowIsMaximized(): Promise<boolean> {
    return invoke<boolean>("window_is_maximized", {});
  },

  windowGetPosition(): Promise<[number, number]> {
    return invoke<[number, number]>("window_get_position", {});
  },

  windowSetPosition(x: number, y: number): Promise<void> {
    return invoke<void>("window_set_position", { x, y });
  },

  windowGetSize(): Promise<[number, number]> {
    return invoke<[number, number]>("window_get_size", {});
  },

  windowSetSize(width: number, height: number): Promise<void> {
    return invoke<void>("window_set_size", { width, height });
  },

  windowSysCommand(action: WindowSysAction): Promise<void> {
    return invoke<void>("window_sys_command", { action });
  },

  windowMinimize(): Promise<void> {
    return invoke<void>("window_minimize", {});
  },

  windowToggleMaximize(): Promise<void> {
    return invoke<void>("window_toggle_maximize", {});
  },

  windowRestoreFocus(): Promise<void> {
    return invoke<void>("window_restore_focus", {});
  },

  windowClose(): Promise<void> {
    return invoke<void>("window_close", {});
  },

  windowOpenUrl(url: string): Promise<void> {
    return invoke<void>("window_open_url", { url });
  },
};
