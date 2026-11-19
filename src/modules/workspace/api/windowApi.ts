import { invoke } from "@/shared/api/tauriClient";
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
  }): Promise<void> {
    return invoke<void>("window_present", {
      cols: params?.cols ?? null,
      rows: params?.rows ?? null,
      width: params?.width ?? null,
      height: params?.height ?? null,
    });
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

  windowClose(): Promise<void> {
    return invoke<void>("window_close", {});
  },
};
