import { bridge } from "./bridge.ts";

export function codeOf(event: KeyboardEvent): string {
  if (event.key === "AltGraph") return "AltRight";
  if (event.key === "Unidentified") return "";
  return event.code;
}

export function forwardKeys(target: Window): () => void {
  const pressed = new Set<string>();
  const forward = (down: boolean) => (event: KeyboardEvent) => {
    const code = codeOf(event);
    if (event.repeat || code === "") return;
    if (down) pressed.add(code);
    else pressed.delete(code);
    void bridge.forwardKey(code, down);
  };
  const onDown = forward(true);
  const onUp = forward(false);
  const onBlur = () => {
    for (const code of pressed) void bridge.forwardKey(code, false);
    pressed.clear();
  };
  target.addEventListener("keydown", onDown, true);
  target.addEventListener("keyup", onUp, true);
  target.addEventListener("blur", onBlur);
  return () => {
    target.removeEventListener("keydown", onDown, true);
    target.removeEventListener("keyup", onUp, true);
    target.removeEventListener("blur", onBlur);
  };
}
