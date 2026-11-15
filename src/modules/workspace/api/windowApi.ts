import { invoke } from "@/shared/api/tauriClient";
import type { AppStatusDto } from "../types";

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
