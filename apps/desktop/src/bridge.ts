import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Route } from "./api.ts";
import { isMessageId, type Language, type MessageId } from "./i18n.ts";

export type MicStatus = "unknown" | "ready" | "denied" | "missing" | "failing";

export interface Overview {
  hotkey: string[];
  autostart: boolean;
  microphone: MicStatus;
  version: string;
}

export type Theme = "light" | "dark";

export type OverlayState =
  | { state: "hidden" }
  | { state: "listening" }
  | { state: "handsFree" }
  | { state: "processing" }
  | { state: "error"; message: MessageId; action: "microphoneSettings" | null };

export interface AccountView {
  signedIn: boolean;
  username: string | null;
}

export interface AppState {
  signedIn: boolean;
  username: string | null;
  firstRunDone: boolean;
  onboarded: boolean;
  handsFreeNote: boolean;
}

export type AccountStep = "choosePassword" | "onboarding" | "done";

export interface Problem {
  message: MessageId;
  backToSignIn: boolean;
}

export interface StyleOption {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
}

export interface Onboarding {
  styles: StyleOption[];
  selected: string;
  dictationLanguages: Language[];
}

export interface UiLanguage {
  choice: Language | null;
  windows: Language;
}

export function problemOf(reason: unknown): Problem {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const { message, backToSignIn } = reason as { message: unknown; backToSignIn?: unknown };
    if (isMessageId(message)) return { message, backToSignIn: backToSignIn === true };
  }
  return { message: "error.generic", backToSignIn: false };
}

export type UpdatePhase =
  | { phase: "available" }
  | { phase: "downloading"; percent: number | null }
  | { phase: "installing" }
  | { phase: "failed" };

export type UpdateView = {
  version: string;
  notes: string;
} & UpdatePhase;

export const bridge = {
  overview: () => invoke<Overview>("overview"),
  captureHotkey: () => invoke<undefined>("capture_hotkey"),
  cancelHotkeyCapture: () => invoke<undefined>("cancel_hotkey_capture"),
  proposeHotkey: (codes: string[]) => invoke<string[]>("propose_hotkey", { codes }),
  confirmHotkey: () => invoke<string[]>("confirm_hotkey"),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  openMicrophoneSettings: () => invoke<undefined>("open_microphone_settings"),
  dismissOverlay: () => invoke<undefined>("dismiss_overlay"),
  stopDictation: () => invoke<undefined>("stop_dictation"),
  keepDictation: (text: string) => invoke<undefined>("keep_dictation", { text }),
  forwardKey: (code: string, down: boolean) => invoke<undefined>("forward_key", { code, down }),
  checkMicrophone: (on: boolean) => invoke<MicStatus>("check_microphone", { on }),
  appState: () => invoke<AppState>("app_state"),
  finishOnboarding: () => invoke<undefined>("finish_onboarding"),
  dismissHandsFreeNote: () => invoke<undefined>("dismiss_hands_free_note"),
  accountStatus: () => invoke<AccountView>("account_status"),
  signIn: (username: string, password: string) =>
    invoke<AccountStep>("sign_in", { username, password }),
  choosePassword: (password: string) => invoke<AccountStep>("choose_password", { password }),
  onboarding: () => invoke<Onboarding>("onboarding"),
  saveOnboarding: (styleId: string, dictationLanguages: Language[]) =>
    invoke<undefined>("save_onboarding", { styleId, dictationLanguages }),
  uiLanguage: () => invoke<UiLanguage>("ui_language"),
  setUiLanguage: (choice: Language | null) => invoke<UiLanguage>("set_ui_language", { choice }),
  theme: () => invoke<Theme | null>("theme"),
  setTheme: (choice: Theme | null) => invoke<Theme | null>("set_theme", { choice }),
  fitUpdate: (contentHeight: number, recenter: boolean) =>
    invoke<undefined>("fit_update", { contentHeight, recenter }),
  openSignIn: () => invoke<undefined>("open_sign_in"),
  signOut: () => invoke<undefined>("sign_out"),
  apiRequest: (route: Route) => invoke<unknown>("api_request", { route }),
  runningApps: () => invoke<string[]>("running_apps"),
  copyText: (text: string) => invoke<undefined>("copy_text", { text }),
  quit: () => invoke<undefined>("quit"),
  updateView: () => invoke<UpdateView | null>("update_view"),
  installUpdate: () => invoke<undefined>("install_update"),
  postponeUpdate: () => invoke<undefined>("postpone_update"),
  onUpdate: (handler: (view: UpdateView) => void): Promise<UnlistenFn> =>
    listen<UpdateView>("update", (event) => {
      handler(event.payload);
    }),
  onOverlay: (handler: (state: OverlayState) => void): Promise<UnlistenFn> =>
    listen<OverlayState>("overlay", (event) => {
      handler(event.payload);
    }),
  onOverlayLevel: (handler: (level: number) => void): Promise<UnlistenFn> =>
    listen<number>("overlay-level", (event) => {
      handler(event.payload);
    }),
  onInsertText: (handler: (text: string) => void): Promise<UnlistenFn> =>
    listen<string>("insert-text", (event) => {
      handler(event.payload);
    }),
  onMicrophoneStatus: (handler: (status: MicStatus) => void): Promise<UnlistenFn> =>
    listen<MicStatus>("microphone-status", (event) => {
      handler(event.payload);
    }),
  onMicrophoneLevel: (handler: (level: number) => void): Promise<UnlistenFn> =>
    listen<number>("microphone-level", (event) => {
      handler(event.payload);
    }),
  onUiLanguage: (handler: (language: Language) => void): Promise<UnlistenFn> =>
    listen<Language>("ui-language", (event) => {
      handler(event.payload);
    }),
  onTheme: (handler: (theme: Theme | null) => void): Promise<UnlistenFn> =>
    listen<Theme | null>("theme", (event) => {
      handler(event.payload);
    }),
  onAccountChanged: (handler: (signedIn: boolean) => void): Promise<UnlistenFn> =>
    listen<boolean>("account-changed", (event) => {
      handler(event.payload);
    }),
  onMainNavigate: (handler: (query: string) => void): Promise<UnlistenFn> =>
    listen<string>("main-navigate", (event) => {
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
