import { useEffect, useRef } from "react";

export const MAX_RECONNECT_BACKOFF_SEC = 30;

export function nextReconnectDelayMs(
  intervalSec: number | undefined,
  attempt: number
): number {
  const baseSec = Math.min(Math.max(Number(intervalSec) || 2, 1), 60);
  const maxSec = Math.max(baseSec, MAX_RECONNECT_BACKOFF_SEC);
  const factor = Math.pow(2, Math.min(Math.max(attempt, 0), 5));
  return Math.min(baseSec * factor, maxSec) * 1000;
}

export interface UseAutoReconnectOptions {
  enabled: boolean;
  connected: boolean;
  disconnected: boolean;
  paused?: boolean;
  intervalSec: number | undefined;
  onReconnect: () => void;
}

export function useAutoReconnect({
  enabled,
  connected,
  disconnected,
  paused = false,
  intervalSec,
  onReconnect,
}: UseAutoReconnectOptions): void {
  const callbackRef = useRef(onReconnect);
  const attemptRef = useRef(0);
  callbackRef.current = onReconnect;

  // Reset backoff only once reconnected or when disabled, not during CONNECTING retries.
  useEffect(() => {
    if (!enabled || connected) {
      attemptRef.current = 0;
    }
  }, [enabled, connected]);

  useEffect(() => {
    if (!enabled || !disconnected || paused) return;
    const delayMs = nextReconnectDelayMs(intervalSec, attemptRef.current);
    const timer = window.setTimeout(() => {
      attemptRef.current += 1;
      callbackRef.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [enabled, disconnected, paused, intervalSec]);
}
