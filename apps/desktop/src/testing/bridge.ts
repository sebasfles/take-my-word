import { vi } from "vitest";
import type { Route } from "../api.ts";
import type {
  AccountStep,
  AccountView,
  Onboarding,
  OverlayState,
  Overview,
  UpdateView,
} from "../bridge.ts";

export const listeners: {
  overlay?: (state: OverlayState) => void;
  captureCancelled?: () => void;
  accountChanged?: (signedIn: boolean) => void;
  update?: (view: UpdateView) => void;
} = {};

export const pendingUpdate: { view: UpdateView | null } = { view: null };

export const signedIn: AccountView = { signedIn: true, username: "sebastian" };

export const onboarding: Onboarding = {
  styles: [
    { id: "plain", name: "Plain", builtin: true },
    { id: "casual", name: "Casual", builtin: true },
    { id: "formal", name: "Formal", builtin: true },
    { id: "c7d1", name: "Client emails", builtin: false },
  ],
  selected: "plain",
};

export const overview: Overview = {
  hotkey: ["Ctrl", "Win"],
  autostart: true,
  microphone: "ready",
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
  finishFirstRun: vi.fn(() => Promise.resolve(undefined)),
  accountStatus: vi.fn(() => Promise.resolve({ ...signedIn })),
  signIn: vi.fn<(username: string, password: string) => Promise<AccountStep>>(() =>
    Promise.resolve("onboarding"),
  ),
  choosePassword: vi.fn<(password: string) => Promise<AccountStep>>(() =>
    Promise.resolve("onboarding"),
  ),
  onboarding: vi.fn(() => Promise.resolve(structuredClone(onboarding))),
  saveDefaultStyle: vi.fn<(styleId: string) => Promise<undefined>>(() =>
    Promise.resolve(undefined),
  ),
  openSignIn: vi.fn(() => Promise.resolve(undefined)),
  signOut: vi.fn(() => Promise.resolve(undefined)),
  apiRequest: vi.fn<(route: Route) => Promise<unknown>>(() => Promise.resolve(null)),
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
  onAccountChanged: vi.fn((handler: (signedIn: boolean) => void) => {
    listeners.accountChanged = handler;
    return Promise.resolve(() => undefined);
  }),
  onHotkeyCaptureCancelled: vi.fn((handler: () => void) => {
    listeners.captureCancelled = handler;
    return Promise.resolve(() => undefined);
  }),
};
