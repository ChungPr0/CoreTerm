import { useEffect, useRef } from "react";
import {
  SSH_DEFAULT_RECONNECT_SEC,
  SSH_MAX_RECONNECT_BACKOFF_SEC,
  SSH_RECONNECT_MAX,
  SSH_RECONNECT_MIN,
} from "@/shared/defaults";

export const MAX_RECONNECT_BACKOFF_SEC = SSH_MAX_RECONNECT_BACKOFF_SEC;

export function nextReconnectDelayMs(
  intervalSec: number | undefined,
  attempt: number
): number {
  const baseSec = Math.min(
    Math.max(Number(intervalSec) || SSH_DEFAULT_RECONNECT_SEC, SSH_RECONNECT_MIN),
    SSH_RECONNECT_MAX
  );
  const maxSec = Math.max(baseSec, MAX_RECONNECT_BACKOFF_SEC);
  const factor = Math.pow(2, Math.min(Math.max(attempt, 0), 5));
  return Math.min(baseSec * factor, maxSec) * 1000;
}

export interface UseAutoReconnectOptions {
  enabled: boolean;
  connected: boolean;
  disconnected: boolean;
  paused?: boolean;
  resetToken?: number;
  intervalSec: number | undefined;
  onReconnect: () => void;
}

export function useAutoReconnect({
  enabled,
  connected,
  disconnected,
  paused = false,
  resetToken = 0,
  intervalSec,
  onReconnect,
}: UseAutoReconnectOptions): void {
  const callbackRef = useRef(onReconnect);
  const attemptRef = useRef(0);
  const prevResetTokenRef = useRef(resetToken);
  callbackRef.current = onReconnect;

  useEffect(() => {
    if (resetToken !== prevResetTokenRef.current) {
      prevResetTokenRef.current = resetToken;
      attemptRef.current = 0;
    }
  }, [resetToken]);

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
