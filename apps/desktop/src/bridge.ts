import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type MicStatus = "unknown" | "ready" | "denied" | "missing" | "failing";

export interface Overview {
  hotkey: string[];
  autostart: boolean;
  microphone: MicStatus;
}

export type OverlayState =
  | { state: "hidden" }
  | { state: "listening" }
  | { state: "processing" }
  | { state: "error"; message: string; action: "microphoneSettings" | null };

export interface AccountView {
  signedIn: boolean;
  username: string | null;
}

export type AccountStep = "choosePassword" | "onboarding" | "done";

export interface Problem {
  message: string;
  backToSignIn: boolean;
}

export interface StyleOption {
  id: string;
  name: string;
}

export interface Onboarding {
  styles: StyleOption[];
  selected: string;
}

export function problemOf(reason: unknown): Problem {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const { message, backToSignIn } = reason as Partial<Problem>;
    if (typeof message === "string") return { message, backToSignIn: backToSignIn === true };
  }
  return { message: "Something went wrong. Try again.", backToSignIn: false };
}

export const bridge = {
  overview: () => invoke<Overview>("overview"),
  captureHotkey: () => invoke<undefined>("capture_hotkey"),
  cancelHotkeyCapture: () => invoke<undefined>("cancel_hotkey_capture"),
  proposeHotkey: (codes: string[]) => invoke<string[]>("propose_hotkey", { codes }),
  confirmHotkey: () => invoke<string[]>("confirm_hotkey"),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  openMicrophoneSettings: () => invoke<undefined>("open_microphone_settings"),
  dismissOverlay: () => invoke<undefined>("dismiss_overlay"),
  finishFirstRun: () => invoke<undefined>("finish_first_run"),
  accountStatus: () => invoke<AccountView>("account_status"),
  signIn: (username: string, password: string) =>
    invoke<AccountStep>("sign_in", { username, password }),
  choosePassword: (password: string) => invoke<AccountStep>("choose_password", { password }),
  onboarding: () => invoke<Onboarding>("onboarding"),
  saveDefaultStyle: (styleId: string) => invoke<undefined>("save_default_style", { styleId }),
  openSignIn: () => invoke<undefined>("open_sign_in"),
  signOut: () => invoke<undefined>("sign_out"),
  quit: () => invoke<undefined>("quit"),
  onOverlay: (handler: (state: OverlayState) => void): Promise<UnlistenFn> =>
    listen<OverlayState>("overlay", (event) => {
      handler(event.payload);
    }),
  onAccountChanged: (handler: (signedIn: boolean) => void): Promise<UnlistenFn> =>
    listen<boolean>("account-changed", (event) => {
      handler(event.payload);
    }),
  onHotkeyCaptureCancelled: (handler: () => void): Promise<UnlistenFn> =>
    listen("hotkey-capture-cancelled", () => {
      handler();
    }),
};

export function keepListening(subscribe: () => Promise<UnlistenFn>): () => void {
  let unlisten: UnlistenFn | undefined;
  let stopped = false;
  void subscribe().then((stop) => {
    if (stopped) stop();
    else unlisten = stop;
  });
  return () => {
    stopped = true;
    unlisten?.();
  };
}
