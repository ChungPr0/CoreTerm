import { useCallback, useEffect, useRef } from "react";

interface WindowMouseDragOptions {
  cursor: string;
  lockUserSelect?: boolean;
  onMove: (ev: MouseEvent) => void;
  onEnd?: () => void;
}

/** Shared window mousemove/mouseup/blur drag tracker with unmount cleanup. */
export function useWindowMouseDrag() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return useCallback((opts: WindowMouseDragOptions) => {
    cleanupRef.current?.();

    const { cursor, lockUserSelect = false, onMove, onEnd } = opts;
    document.body.style.cursor = cursor;
    if (lockUserSelect) document.body.style.userSelect = "none";

    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
      document.body.style.cursor = "";
      if (lockUserSelect) document.body.style.userSelect = "";
      cleanupRef.current = null;
      onEnd?.();
    };

    cleanupRef.current = stop;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
  }, []);
}
