import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n.ts";
import { fakeBridge, listeners } from "../testing/bridge.ts";
import { Overlay } from "./Overlay.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

async function showing(state: Parameters<NonNullable<typeof listeners.overlay>>[0]) {
  render(<Overlay />);
  await act(async () => {
    await Promise.resolve();
    listeners.overlay?.(state);
  });
}

describe("Overlay", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("follows the shell from listening to processing to hidden", async () => {
    await showing({ state: "listening" });
    expect(screen.getByRole("status").textContent).toBe("Listening");
    act(() => {
      listeners.overlay?.({ state: "processing" });
    });
    expect(screen.getByRole("status").textContent).toBe("Processing");
    act(() => {
      listeners.overlay?.({ state: "hidden" });
    });
    expect(screen.queryByRole("status")).toBeNull();
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
      listeners.overlay?.({ state: "processing" });
    });
    expect(document.querySelector(".waveform")).toBeNull();
  });

  it("dismisses an error on click", async () => {
    await showing({ state: "error", message: "overlay.unreachable", action: null });
    expect(screen.getByRole("alert").textContent).toContain("Can't reach Take My Word.");
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
