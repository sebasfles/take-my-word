import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBridge, listeners } from "../testing/bridge.ts";
import { Overlay } from "./Overlay.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

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

  it("dismisses an error on click", async () => {
    await showing({ state: "error", message: "Can't reach Take My Word.", action: null });
    fireEvent.click(screen.getByRole("alert"));
    expect(fakeBridge.dismissOverlay).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("links a blocked microphone to the privacy settings without dismissing", async () => {
    await showing({
      state: "error",
      message: "Windows blocks the microphone.",
      action: "microphoneSettings",
    });
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(fakeBridge.openMicrophoneSettings).toHaveBeenCalledOnce();
    expect(fakeBridge.dismissOverlay).not.toHaveBeenCalled();
  });
});
