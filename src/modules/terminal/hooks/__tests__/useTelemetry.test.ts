import { beforeEach, describe, expect, it } from "vitest";
import { useTelemetryStore } from "../useTelemetry";

describe("useTelemetryStore", () => {
  beforeEach(() => {
    useTelemetryStore.setState({
      telemetryByHost: {},
      hiddenTelemetryIds: {},
    });
  });

  it("tracks per-host metrics and tab visibility state", () => {
    useTelemetryStore.getState().setMetric({
      host_id: "h1",
      cpu_usage_percent: 42.5,
      ram_used_mb: 1024,
      ram_total_mb: 4096,
      ram_usage_percent: 25,
      swap_used_mb: 0,
      swap_total_mb: 0,
      is_stale: false,
      sampled_at_ms: 1_700_000_000_000,
    });

    expect(useTelemetryStore.getState().telemetryByHost["h1"]?.cpu_usage_percent).toBe(42.5);

    useTelemetryStore.getState().hideTabTelemetry("t1");
    useTelemetryStore.getState().hideTabTelemetry("t2");
    expect(useTelemetryStore.getState().hiddenTelemetryIds).toEqual({ t1: true, t2: true });

    useTelemetryStore.getState().showTabTelemetry("t1");
    expect(useTelemetryStore.getState().hiddenTelemetryIds).toEqual({ t2: true });

    useTelemetryStore.getState().clearHiddenForTabs(["t2", "missing"]);
    expect(useTelemetryStore.getState().hiddenTelemetryIds).toEqual({});
  });
});
