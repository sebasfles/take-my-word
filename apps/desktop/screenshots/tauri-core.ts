const params = new URLSearchParams(window.location.search);

const problem = (message: string) =>
  Promise.reject(Object.assign(new Error(message), { backToSignIn: false }));

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
    default:
      return answer(undefined);
  }
}
