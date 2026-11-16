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

  windowSetLaunchSize(cols: number, rows: number): Promise<void> {
    return invoke<void>("window_set_launch_size", { cols, rows });
  },

  windowPresent(params?: { cols?: number; rows?: number }): Promise<void> {
    return invoke<void>("window_present", {
      cols: params?.cols ?? null,
      rows: params?.rows ?? null,
    });
  },

  windowIsMaximized(): Promise<boolean> {
    return invoke<boolean>("window_is_maximized", {});
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
