import { invoke } from "@/shared/api/tauriClient";

export async function copyText(text: string): Promise<void> {
  if (!text) return;
  try {
    await invoke<void>("clipboard_write_text", { text });
  } catch {
    await navigator.clipboard.writeText(text).catch(() => {});
  }
}

export async function readText(): Promise<string> {
  try {
    return await invoke<string>("clipboard_read_text", {});
  } catch {
    return await navigator.clipboard.readText().catch(() => "");
  }
}

export function replaceInputSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string
): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const nextVal = el.value.slice(0, start) + text + el.value.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, nextVal);
  } else {
    el.value = nextVal;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  el.focus();
}
