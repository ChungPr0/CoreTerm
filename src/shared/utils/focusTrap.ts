const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
  "[contenteditable='true']",
].join(", ");

export function getTabbableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR);
  const result: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.tabIndex < 0) continue;
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
      continue;
    }
    if (el.closest("[inert]")) continue;
    if (el.getClientRects().length === 0) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    result.push(el);
  }
  return result;
}

export function trapTabWithin(container: HTMLElement | null, e: KeyboardEvent): void {
  if (!container || e.key !== "Tab") return;
  const tabbables = getTabbableElements(container);
  if (tabbables.length === 0) {
    e.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }

  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  const active = document.activeElement as HTMLElement | null;

  if (!active || !container.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }

  if (e.shiftKey) {
    if (active === first || active === container) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function setElementInert(el: HTMLElement | null, inert: boolean): void {
  if (!el) return;
  const target = el as HTMLElement & { inert?: boolean };
  target.inert = inert;
  if (inert) {
    el.setAttribute("inert", "");
  } else {
    el.removeAttribute("inert");
  }
}
