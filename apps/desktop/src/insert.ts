import { bridge } from "./bridge.ts";

const textInputs = new Set(["text", "search", "email", "url", "tel", ""]);

export function insertAtFocus(text: string): boolean {
  const element = document.activeElement;
  if (!document.hasFocus()) return false;
  if (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && textInputs.has(element.type))
  ) {
    if (element.readOnly || element.disabled) return false;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    element.setRangeText(text, start, end, "end");
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

export function insertDictations(): () => void {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  void bridge
    .onInsertText((text) => {
      if (!insertAtFocus(text)) void bridge.keepDictation(text);
    })
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    });
  return () => {
    stopped = true;
    unlisten?.();
  };
}
