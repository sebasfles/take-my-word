import { vi } from "vitest";
import type { Route } from "../api.ts";
import type { Language } from "../i18n.ts";
import type {
  AccountStep,
  AccountView,
  AppState,
  MicStatus,
  Onboarding,
  OverlayState,
  Overview,
  Theme,
  UiLanguage,
  UpdateView,
} from "../bridge.ts";

export const listeners: {
  overlay?: (state: OverlayState) => void;
  overlayLevel?: (level: number) => void;
  microphoneLevel?: (level: number) => void;
  microphoneStatus?: (status: MicStatus) => void;
  insertText?: (text: string) => void;
  mainNavigate?: (query: string) => void;
  uiLanguage?: (language: Language) => void;
  theme?: (theme: Theme | null) => void;
  captureCancelled?: () => void;
  accountChanged?: (signedIn: boolean) => void;
  update?: (view: UpdateView) => void;
} = {};

export const pendingUpdate: { view: UpdateView | null } = { view: null };

export const signedIn: AccountView = { signedIn: true, username: "sebastian" };

export const appState: AppState = {
  signedIn: true,
  username: "sebastian",
  firstRunDone: true,
  onboarded: true,
  handsFreeNote: false,
};

export const onboarding: Onboarding = {
  styles: [
    { id: "plain", name: "Plain", prompt: "", builtin: true },
    { id: "casual", name: "Casual", prompt: "Write casually.", builtin: true },
    { id: "formal", name: "Formal", prompt: "Write formally.", builtin: true },
    {
      id: "c7d1",
      name: "Client emails",
      prompt: "Formal address, short sentences and a cordial closing. No emoji.",
      builtin: false,
    },
  ],
  selected: "plain",
  dictationLanguages: ["es"],
};

export const storedSettings = {
  defaultStyleId: "plain",
  locale: "es",
  dictationLanguages: ["es"],
  providers: { transcriber: "groq-whisper", refiner: "openai" },
};

export const uiLanguage: UiLanguage = { choice: null, windows: "es" };

export const overview: Overview = {
  hotkey: ["Ctrl", "Win"],
  autostart: true,
  microphone: "ready",
  version: "0.2.0",
};

export const fakeBridge = {
  overview: vi.fn(() => Promise.resolve({ ...overview })),
  captureHotkey: vi.fn(() => Promise.resolve(undefined)),
  cancelHotkeyCapture: vi.fn(() => Promise.resolve(undefined)),
  proposeHotkey: vi.fn((codes: string[]) =>
    codes.includes("AltRight")
      ? Promise.reject(Object.assign(new Error("hotkey.rightAlt"), { backToSignIn: false }))
      : Promise.resolve(["Ctrl", "Shift"]),
  ),
  confirmHotkey: vi.fn(() => Promise.resolve(["Ctrl", "Shift"])),
  setAutostart: vi.fn((enabled: boolean) => Promise.resolve(enabled)),
  openMicrophoneSettings: vi.fn(() => Promise.resolve(undefined)),
  dismissOverlay: vi.fn(() => Promise.resolve(undefined)),
  stopDictation: vi.fn(() => Promise.resolve(undefined)),
  keepDictation: vi.fn<(text: string) => Promise<undefined>>(() => Promise.resolve(undefined)),
  forwardKey: vi.fn<(code: string, down: boolean) => Promise<undefined>>(() =>
    Promise.resolve(undefined),
  ),
  checkMicrophone: vi.fn<(on: boolean) => Promise<MicStatus>>(() => Promise.resolve("ready")),
  appState: vi.fn(() => Promise.resolve({ ...appState })),
  finishOnboarding: vi.fn(() => Promise.resolve(undefined)),
  dismissHandsFreeNote: vi.fn(() => Promise.resolve(undefined)),
  accountStatus: vi.fn(() => Promise.resolve({ ...signedIn })),
  signIn: vi.fn<(username: string, password: string) => Promise<AccountStep>>(() =>
    Promise.resolve("onboarding"),
  ),
  choosePassword: vi.fn<(password: string) => Promise<AccountStep>>(() =>
    Promise.resolve("onboarding"),
  ),
  onboarding: vi.fn(() => Promise.resolve(structuredClone(onboarding))),
  saveOnboarding: vi.fn<(styleId: string, dictationLanguages: Language[]) => Promise<undefined>>(
    () => Promise.resolve(undefined),
  ),
  uiLanguage: vi.fn(() => Promise.resolve({ ...uiLanguage })),
  setUiLanguage: vi.fn((choice: Language | null) => Promise.resolve({ ...uiLanguage, choice })),
  theme: vi.fn((): Promise<Theme | null> => Promise.resolve(null)),
  setTheme: vi.fn((choice: Theme | null) => Promise.resolve(choice)),
  fitUpdate: vi.fn<(contentHeight: number, recenter: boolean) => Promise<undefined>>(() =>
    Promise.resolve(undefined),
  ),
  openSignIn: vi.fn(() => Promise.resolve(undefined)),
  signOut: vi.fn(() => Promise.resolve(undefined)),
  apiRequest: vi.fn<(route: Route) => Promise<unknown>>((route) => {
    if (route.route === "getSettings") return Promise.resolve(structuredClone(storedSettings));
    if (route.route === "replaceSettings") return Promise.resolve(route.body);
    return Promise.resolve(null);
  }),
  runningApps: vi.fn(() => Promise.resolve(["notepad.exe", "outlook.exe"])),
  copyText: vi.fn<(text: string) => Promise<undefined>>(() => Promise.resolve(undefined)),
  quit: vi.fn(() => Promise.resolve(undefined)),
  updateView: vi.fn(() => Promise.resolve(pendingUpdate.view)),
  installUpdate: vi.fn(() => Promise.resolve(undefined)),
  postponeUpdate: vi.fn(() => Promise.resolve(undefined)),
  onUpdate: vi.fn((handler: (view: UpdateView) => void) => {
    listeners.update = handler;
    return Promise.resolve(() => undefined);
  }),
  onOverlay: vi.fn((handler: (state: OverlayState) => void) => {
    listeners.overlay = handler;
    return Promise.resolve(() => undefined);
  }),
  onOverlayLevel: vi.fn((handler: (level: number) => void) => {
    listeners.overlayLevel = handler;
    return Promise.resolve(() => undefined);
  }),
  onInsertText: vi.fn((handler: (text: string) => void) => {
    listeners.insertText = handler;
    return Promise.resolve(() => undefined);
  }),
  onMicrophoneStatus: vi.fn((handler: (status: MicStatus) => void) => {
    listeners.microphoneStatus = handler;
    return Promise.resolve(() => undefined);
  }),
  onMicrophoneLevel: vi.fn((handler: (level: number) => void) => {
    listeners.microphoneLevel = handler;
    return Promise.resolve(() => undefined);
  }),
  onUiLanguage: vi.fn((handler: (language: Language) => void) => {
    listeners.uiLanguage = handler;
    return Promise.resolve(() => undefined);
  }),
  onTheme: vi.fn((handler: (theme: Theme | null) => void) => {
    listeners.theme = handler;
    return Promise.resolve(() => undefined);
  }),
  onAccountChanged: vi.fn((handler: (signedIn: boolean) => void) => {
    listeners.accountChanged = handler;
    return Promise.resolve(() => undefined);
  }),
  onMainNavigate: vi.fn((handler: (query: string) => void) => {
    listeners.mainNavigate = handler;
    return Promise.resolve(() => undefined);
  }),
  onHotkeyCaptureCancelled: vi.fn((handler: () => void) => {
    listeners.captureCancelled = handler;
    return Promise.resolve(() => undefined);
  }),
};
