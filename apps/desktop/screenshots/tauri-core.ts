const params = new URLSearchParams(window.location.search);

const problem = (message: string) =>
  Promise.reject(Object.assign(new Error(message), { backToSignIn: false }));

const updatePhases: Record<string, object> = {
  available: { phase: "available" },
  downloading: { phase: "downloading", percent: 40 },
  installing: { phase: "installing" },
  failed: { phase: "failed" },
};

const updateNotes = {
  es: "Pega más rápido en terminales y recupera el portapapeles aunque otra app lo tenga ocupado.\nCorrige el atajo con teclados en español.",
  en: "Pastes faster in terminals and restores the clipboard even when another app holds it.\nFixes the shortcut on Spanish keyboards.",
};

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
    case "account_status":
      return answer(
        params.get("account") === "signed-out"
          ? { signedIn: false, username: null }
          : { signedIn: true, username: "sebastian" },
      );
    case "sign_in":
      if (params.get("signin") === "wrong") {
        return problem("Wrong username or password.");
      }
      return answer(params.get("signin") === "new-password" ? "choosePassword" : "onboarding");
    case "choose_password":
      return params.get("password") === "weak"
        ? problem("The password does not meet the requirements.")
        : answer("onboarding");
    case "onboarding":
      return params.get("styles") === "fail"
        ? problem("We could not reach the service. Try again in a few minutes.")
        : answer({
            styles: [
              { id: "plain", name: "Plain" },
              { id: "casual", name: "Casual" },
              { id: "formal", name: "Formal" },
              { id: "c7d1", name: "Client emails" },
            ],
            selected: "plain",
          });
    case "set_autostart":
      return params.get("autostart-fails") === "1"
        ? Promise.reject(new Error("access denied"))
        : answer(args?.enabled);
    case "update_view": {
      const language = params.get("lang") === "en" ? "en" : "es";
      return answer({
        language,
        version: "0.1.1",
        notes: updateNotes[language],
        ...updatePhases[params.get("update") ?? "available"],
      });
    }
    default:
      return answer(undefined);
  }
}
