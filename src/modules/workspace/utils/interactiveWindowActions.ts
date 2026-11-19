import { windowApi } from "../api/windowApi";

export async function startInteractiveWindowMove(): Promise<void> {
  try {
    const isMax = await windowApi.windowIsMaximized();
    if (isMax) return;

    const [startWinX, startWinY] = await windowApi.windowGetPosition();

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "999999";
    overlay.style.cursor = "move";
    overlay.style.userSelect = "none";
    document.body.appendChild(overlay);

    let startMouseX: number | null = null;
    let startMouseY: number | null = null;
    let rafId: number | null = null;
    let pendingX = startWinX;
    let pendingY = startWinY;

    const flushMove = () => {
      rafId = null;
      void windowApi.windowSetPosition(pendingX, pendingY);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (startMouseX === null || startMouseY === null) {
        startMouseX = ev.screenX;
        startMouseY = ev.screenY;
        return;
      }
      const dx = ev.screenX - startMouseX;
      const dy = ev.screenY - startMouseY;
      pendingX = Math.round(startWinX + dx);
      pendingY = Math.round(startWinY + dy);
      if (rafId === null) {
        rafId = requestAnimationFrame(flushMove);
      }
    };

    const onPointerDown = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        cleanup();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
  } catch (err) {
    console.error("Failed to start interactive window move:", err);
  }
}
