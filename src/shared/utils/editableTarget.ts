const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "color",
  "range",
]);

export function getEditableInput(
  target: EventTarget | null
): HTMLInputElement | HTMLTextAreaElement | null {
  if (target instanceof HTMLTextAreaElement) {
    return target;
  }
  if (
    target instanceof HTMLInputElement &&
    !NON_TEXT_INPUT_TYPES.has(target.type)
  ) {
    return target;
  }
  return null;
}

export function scrollAndFocusInput(element: HTMLElement | null): void {
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus({ preventScroll: true });
}
