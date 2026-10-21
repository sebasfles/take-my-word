import { vi } from "vitest";
import type { OverlayState, Overview } from "../bridge.ts";

export const listeners: {
  overlay?: (state: OverlayState) => void;
  captureCancelled?: () => void;
} = {};

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
      ? Promise.reject(new Error("Right Alt is AltGr on many keyboards"))
      : Promise.resolve(["Ctrl", "Shift"]),
  ),
  confirmHotkey: vi.fn(() => Promise.resolve(["Ctrl", "Shift"])),
  setAutostart: vi.fn((enabled: boolean) => Promise.resolve(enabled)),
  openMicrophoneSettings: vi.fn(() => Promise.resolve(undefined)),
  dismissOverlay: vi.fn(() => Promise.resolve(undefined)),
  finishFirstRun: vi.fn(() => Promise.resolve(undefined)),
  quit: vi.fn(() => Promise.resolve(undefined)),
  onOverlay: vi.fn((handler: (state: OverlayState) => void) => {
    listeners.overlay = handler;
    return Promise.resolve(() => undefined);
  }),
  onHotkeyCaptureCancelled: vi.fn((handler: () => void) => {
    listeners.captureCancelled = handler;
    return Promise.resolve(() => undefined);
  }),
};
