import { bridge } from "./bridge.ts";

const selectable = new Set(["text", "search", "url", "tel"]);

function insert(text: string): boolean {
  const element = document.activeElement;
  if (!document.hasFocus()) return false;
  const field =
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && selectable.has(element.type));
  if (!field || element.readOnly || element.disabled) return false;
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? element.value.length;
  element.setRangeText(text, start, end, "end");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function insertAtFocus(text: string): boolean {
  try {
    return insert(text);
  } catch {
    return false;
  }
}

export function insertDictations(): () => void {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  void bridge
    .onInsertText(({ id, text }) => {
      void bridge.insertAck(id, insertAtFocus(text));
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
