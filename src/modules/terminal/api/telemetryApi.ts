import { invoke, listenEvent, type UnlistenFn } from "@/shared/api/tauriClient";
import type { TelemetryMetricsEventDto } from "../types";

export const telemetryApi = {
  telemetrySetLocalConfig(enabled: boolean, intervalSec: number): Promise<void> {
    return invoke<void>("telemetry_set_local_config", {
      enabled,
      interval_sec: intervalSec,
    });
  },

  onTelemetryMetrics(
    handler: (payload: TelemetryMetricsEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("telemetry:metrics", handler);
  },
};
