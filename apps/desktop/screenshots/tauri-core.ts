const params = new URLSearchParams(window.location.search);

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const answer = (value: unknown) => Promise.resolve(value as T);
  switch (command) {
    case "overview":
      return answer({
        hotkey: ["Ctrl", "Win"],
        autostart: params.get("autostart") !== "off",
        microphone: params.get("mic") ?? "ready",
      });
    case "propose_hotkey":
      return params.get("propose") === "altgr"
        ? Promise.reject(
            new Error(
              "Right Alt is AltGr on many keyboards, so it cannot be part of the shortcut.",
            ),
          )
        : answer(["Ctrl", "Shift"]);
    case "set_autostart":
      return params.get("autostart-fails") === "1"
        ? Promise.reject(new Error("access denied"))
        : answer(args?.enabled);
    default:
      return answer(undefined);
  }
}
