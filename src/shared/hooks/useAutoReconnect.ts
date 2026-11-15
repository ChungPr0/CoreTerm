import { useEffect, useRef } from "react";

export function useAutoReconnect(
  enabled: boolean,
  disconnected: boolean,
  intervalSec: number | undefined,
  onReconnect: () => void
): void {
  const callbackRef = useRef(onReconnect);
  callbackRef.current = onReconnect;

  useEffect(() => {
    if (!enabled || !disconnected) return;
    const delayMs = Math.min(Math.max(Number(intervalSec) || 2, 1), 60) * 1000;
    const timer = window.setTimeout(() => callbackRef.current(), delayMs);
    return () => window.clearTimeout(timer);
  }, [enabled, disconnected, intervalSec]);
}
