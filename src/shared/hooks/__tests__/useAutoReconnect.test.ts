import { describe, expect, it } from "vitest";
import { MAX_RECONNECT_BACKOFF_SEC, nextReconnectDelayMs } from "../useAutoReconnect";

describe("useAutoReconnect backoff", () => {
  it("applies exponential backoff capped at max interval", () => {
    expect(nextReconnectDelayMs(2, 0)).toBe(2000);
    expect(nextReconnectDelayMs(2, 1)).toBe(4000);
    expect(nextReconnectDelayMs(2, 2)).toBe(8000);
    expect(nextReconnectDelayMs(2, 3)).toBe(16000);
    expect(nextReconnectDelayMs(2, 4)).toBe(MAX_RECONNECT_BACKOFF_SEC * 1000);
    expect(nextReconnectDelayMs(2, 10)).toBe(MAX_RECONNECT_BACKOFF_SEC * 1000);
  });

  it("clamps base interval and respects larger user intervals", () => {
    expect(nextReconnectDelayMs(undefined, 0)).toBe(2000);
    expect(nextReconnectDelayMs(0, 0)).toBe(2000);
    expect(nextReconnectDelayMs(0.2, 0)).toBe(1000);
    expect(nextReconnectDelayMs(45, 0)).toBe(45000);
    expect(nextReconnectDelayMs(45, 3)).toBe(45000);
    expect(nextReconnectDelayMs(120, 0)).toBe(60000);
  });
});
