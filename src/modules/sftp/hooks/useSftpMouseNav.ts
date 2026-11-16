import { useEffect, useRef } from "react";

interface UseSftpMouseNavOpts {
  isVisible: boolean;
  modalOpenRef: React.MutableRefObject<boolean>;
  showLocalRef: React.MutableRefObject<boolean>;
  activePaneRef: React.MutableRefObject<"local" | "remote">;
  onNavigate: (kind: "local" | "remote", delta: -1 | 1) => void;
}

/** Intercepts mouse side buttons (XButton1/XButton2) to step folder history in the active SFTP pane. */
export function useSftpMouseNav({
  isVisible,
  modalOpenRef,
  showLocalRef,
  activePaneRef,
  onNavigate,
}: UseSftpMouseNavOpts): void {
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    if (!isVisible) return;
    const onMouseNav = (e: MouseEvent) => {
      if ((e.button !== 3 && e.button !== 4) || modalOpenRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type !== "mousedown") return;
      const paneEl = (e.target as HTMLElement | null)?.closest(
        "[data-sftp-pane]"
      ) as HTMLElement | null;
      const kind: "local" | "remote" =
        paneEl?.dataset.sftpPane === "local"
          ? "local"
          : paneEl?.dataset.sftpPane === "remote"
            ? "remote"
            : showLocalRef.current
              ? activePaneRef.current
              : "remote";
      onNavigateRef.current(kind, e.button === 3 ? -1 : 1);
    };

    window.addEventListener("mousedown", onMouseNav, true);
    window.addEventListener("mouseup", onMouseNav, true);
    window.addEventListener("auxclick", onMouseNav, true);
    return () => {
      window.removeEventListener("mousedown", onMouseNav, true);
      window.removeEventListener("mouseup", onMouseNav, true);
      window.removeEventListener("auxclick", onMouseNav, true);
    };
  }, [isVisible, modalOpenRef, showLocalRef, activePaneRef]);
}
