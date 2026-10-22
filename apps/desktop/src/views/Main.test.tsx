import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n.ts";
import { appState, fakeBridge, listeners } from "../testing/bridge.ts";
import { Main } from "./Main.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

describe("Main", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens an upgraded user straight in the app", async () => {
    render(<Main />);
    await screen.findByRole("heading", { name: "General" });
  });

  it("starts a fresh install at the welcome step", async () => {
    fakeBridge.appState.mockResolvedValueOnce({
      ...appState,
      signedIn: false,
      firstRunDone: false,
      onboarded: false,
    });
    render(<Main />);
    await screen.findByRole("heading", { name: "Talk instead of typing, in any app" });
    expect(screen.getByText("Step 1 of 7")).toBeTruthy();
  });

  it("reruns the guide from General without asking to sign in", async () => {
    render(<Main />);
    fireEvent.click(await screen.findByRole("button", { name: "Open the guide" }));
    await screen.findByRole("heading", { name: "Talk instead of typing, in any app" });
    expect(screen.getByText("Step 1 of 6")).toBeTruthy();
  });

  it("returns to sign-in when the session ends while the app is open", async () => {
    render(<Main />);
    await screen.findByRole("heading", { name: "General" });
    fakeBridge.appState.mockResolvedValueOnce({ ...appState, signedIn: false });
    await act(async () => {
      await Promise.resolve();
      listeners.accountChanged?.(false);
    });
    await screen.findByRole("heading", { name: "Sign in" });
  });
});
