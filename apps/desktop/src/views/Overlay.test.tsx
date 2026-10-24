import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayState } from "../bridge.ts";
import { setLanguage } from "../i18n.ts";
import { fakeBridge, listeners } from "../testing/bridge.ts";
import { Overlay } from "./Overlay.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

let seq = 0;
const send = (state: OverlayState) => listeners.overlay?.({ ...state, seq: ++seq });

async function showing(state: OverlayState) {
  render(<Overlay />);
  await act(async () => {
    await Promise.resolve();
    send(state);
  });
}

describe("Overlay", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("tells the shell it is ready only once it listens for states", async () => {
    let attach: (() => void) | undefined;
    fakeBridge.onOverlay.mockImplementationOnce((handler) => {
      listeners.overlay = handler;
      return new Promise((resolve) => {
        attach = () => {
          resolve(() => undefined);
        };
      });
    });
    render(<Overlay />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fakeBridge.overlayReady).not.toHaveBeenCalled();
    await act(async () => {
      attach?.();
      await Promise.resolve();
    });
    expect(fakeBridge.overlayReady).toHaveBeenCalledOnce();
  });

  it("keeps telling the shell it is ready until the shell hears it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fakeBridge.overlayReady.mockRejectedValueOnce(new Error("not managed yet"));
    render(<Overlay />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fakeBridge.overlayReady).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fakeBridge.overlayReady).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fakeBridge.overlayReady).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("confirms a shown state only after a frame is drawn, and only the latest one", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      frames.push(callback),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames[id - 1] = () => undefined;
    });
    const drawFrame = () => {
      act(() => {
        frames.splice(0).forEach((callback) => {
          callback(0);
        });
      });
    };
    await showing({ state: "listening" });
    const listening = seq;
    act(() => {
      send({ state: "processing" });
    });
    drawFrame();
    drawFrame();
    expect(fakeBridge.overlayPainted.mock.calls).toEqual([[listening + 1]]);
    act(() => {
      send({ state: "hidden" });
    });
    drawFrame();
    drawFrame();
    expect(fakeBridge.overlayPainted).toHaveBeenCalledOnce();
  });

  it("follows the shell from listening to processing to hidden with no visible label", async () => {
    await showing({ state: "listening" });
    expect(screen.getByRole("status").textContent).toBe("Listening");
    expect(document.querySelector(".overlay-quiet .tmw-overlay-label")).not.toBeNull();
    act(() => {
      send({ state: "processing" });
    });
    expect(screen.getByRole("status").textContent).toBe("Cleaning up");
    expect(document.querySelector(".overlay-quiet .tmw-spinner")).not.toBeNull();
    act(() => {
      send({ state: "hidden" });
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a stop only while hands-free, and stopping goes to the shell", async () => {
    await showing({ state: "listening" });
    expect(screen.queryByRole("button")).toBeNull();
    act(() => {
      send({ state: "handsFree" });
    });
    expect(document.querySelectorAll(".waveform-bar")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "Stop and paste" }));
    expect(fakeBridge.stopDictation).toHaveBeenCalledOnce();
  });

  it("shows the shell's message ids in the chosen language", async () => {
    setLanguage("es");
    await showing({ state: "error", message: "overlay.quota", action: null });
    expect(screen.getByRole("alert").textContent).toBe("Llegaste al límite de dictados de hoy.");
    setLanguage("en");
  });

  it("draws the voice level while listening and stays flat on silence", async () => {
    await showing({ state: "listening" });
    const bars = () =>
      Array.from(document.querySelectorAll<HTMLElement>(".waveform-bar"), (bar) =>
        bar.style.getPropertyValue("--level"),
      );
    expect(bars()).toHaveLength(9);
    expect(new Set(bars())).toEqual(new Set(["0"]));
    act(() => {
      listeners.overlayLevel?.(1);
      listeners.overlayLevel?.(0);
    });
    expect(bars().slice(-3)).toEqual(["0", "1", "0"]);
    act(() => {
      send({ state: "processing" });
    });
    expect(document.querySelector(".waveform")).toBeNull();
  });

  it("dismisses an error on click", async () => {
    await showing({ state: "error", message: "overlay.unreachable", action: null });
    expect(screen.getByRole("alert").textContent).toContain("We could not reach the service.");
    fireEvent.click(screen.getByRole("alert"));
    expect(fakeBridge.dismissOverlay).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("links a blocked microphone to the privacy settings without dismissing", async () => {
    await showing({
      state: "error",
      message: "overlay.microphoneBlocked",
      action: "microphoneSettings",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(fakeBridge.openMicrophoneSettings).toHaveBeenCalledOnce();
    expect(fakeBridge.dismissOverlay).not.toHaveBeenCalled();
  });
});
