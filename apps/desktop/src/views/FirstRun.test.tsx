import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n.ts";
import { fakeBridge, overview } from "../testing/bridge.ts";
import { FirstRun } from "./FirstRun.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

describe("FirstRun", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("explains the shortcut and is dismissed for good", async () => {
    render(<FirstRun />);
    await screen.findByText("Win");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(fakeBridge.finishFirstRun).toHaveBeenCalledOnce();
  });

  it("sends a blocked microphone to the Windows privacy settings", async () => {
    fakeBridge.overview.mockResolvedValueOnce({ ...overview, microphone: "denied" });
    render(<FirstRun />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Open microphone settings" }));
    expect(fakeBridge.openMicrophoneSettings).toHaveBeenCalledOnce();
  });
});
