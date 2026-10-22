import { bridge } from "./bridge.ts";

export function codeOf(event: KeyboardEvent): string {
  if (event.key === "AltGraph") return "AltRight";
  if (event.key === "Unidentified") return "";
  return event.code;
}

export function forwardKeys(target: Window): () => void {
  const forward = (down: boolean) => (event: KeyboardEvent) => {
    const code = codeOf(event);
    if (event.repeat || code === "") return;
    void bridge.forwardKey(code, down);
  };
  const onDown = forward(true);
  const onUp = forward(false);
  target.addEventListener("keydown", onDown, true);
  target.addEventListener("keyup", onUp, true);
  return () => {
    target.removeEventListener("keydown", onDown, true);
    target.removeEventListener("keyup", onUp, true);
  };
}
