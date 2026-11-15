import { create } from "zustand";
import type { TelemetryMetricsEventDto } from "../types";

interface TelemetryStoreState {
  telemetryByHost: Record<string, TelemetryMetricsEventDto>;
  hiddenTelemetryIds: Record<string, boolean>;
  setMetric: (metric: TelemetryMetricsEventDto) => void;
  hideTabTelemetry: (tabId: string) => void;
  showTabTelemetry: (tabId: string) => void;
  clearHiddenForTabs: (tabIds: string[]) => void;
}

export const useTelemetryStore = create<TelemetryStoreState>((set) => ({
  telemetryByHost: {},
  hiddenTelemetryIds: {},

  setMetric: (metric) =>
    set((s) => ({
      telemetryByHost: { ...s.telemetryByHost, [metric.host_id]: metric },
    })),

  hideTabTelemetry: (tabId) =>
    set((s) => ({
      hiddenTelemetryIds: { ...s.hiddenTelemetryIds, [tabId]: true },
    })),

  showTabTelemetry: (tabId) =>
    set((s) => {
      if (!s.hiddenTelemetryIds[tabId]) return s;
      const next = { ...s.hiddenTelemetryIds };
      delete next[tabId];
      return { hiddenTelemetryIds: next };
    }),

  clearHiddenForTabs: (tabIds) =>
    set((s) => {
      let changed = false;
      const next = { ...s.hiddenTelemetryIds };
      for (const id of tabIds) {
        if (next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? { hiddenTelemetryIds: next } : s;
    }),
}));
