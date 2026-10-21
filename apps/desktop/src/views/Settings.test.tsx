import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n.ts";
import { fakeBridge, listeners } from "../testing/bridge.ts";
import { Settings } from "./Settings.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

function keys() {
  return Array.from(document.querySelectorAll("kbd"), (key) => key.textContent);
}

async function startCapture() {
  render(<Settings />);
  await screen.findByText("Win");
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  await screen.findByText("Press the new shortcut, then release it.");
}

function chord(...pressed: { code: string; key: string }[]) {
  for (const key of pressed) fireEvent.keyDown(window, key);
  const last = pressed.at(-1);
  if (last) fireEvent.keyUp(window, last);
}

const ctrl = { code: "ControlLeft", key: "Control" };
const shift = { code: "ShiftLeft", key: "Shift" };
const win = { code: "MetaLeft", key: "Meta" };
const altGr = { code: "AltRight", key: "AltGraph" };

describe("Settings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("proposes the keys held at the first release and applies them only when saved", async () => {
    await startCapture();
    chord(ctrl, shift);
    expect(fakeBridge.proposeHotkey).toHaveBeenCalledWith(["ControlLeft", "ShiftLeft"]);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(fakeBridge.confirmHotkey).toHaveBeenCalledOnce();
    await screen.findByRole("button", { name: "Change" });
    expect(keys()).toEqual(["Ctrl", "Shift"]);
  });

  it("drops a proposed shortcut on cancel", async () => {
    await startCapture();
    chord(ctrl, shift);
    await screen.findByRole("button", { name: "Save" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fakeBridge.cancelHotkeyCapture).toHaveBeenCalledOnce();
    expect(fakeBridge.confirmHotkey).not.toHaveBeenCalled();
    expect(keys()).toEqual(["Ctrl", "Win"]);
  });

  it("sends AltGr as Right Alt and shows why it is refused", async () => {
    await startCapture();
    chord(ctrl, altGr);
    expect(fakeBridge.proposeHotkey).toHaveBeenCalledWith(["ControlLeft", "AltRight"]);
    expect((await screen.findByRole("alert")).textContent).toContain("Right Alt");
    expect(keys()).toEqual(["Ctrl", "Win"]);
  });

  it("ignores keys outside the hotkey model while Win is held", async () => {
    await startCapture();
    fireEvent.keyDown(window, ctrl);
    fireEvent.keyDown(window, win);
    fireEvent.keyDown(window, { code: "", key: "Unidentified" });
    fireEvent.keyUp(window, { code: "", key: "Unidentified" });
    expect(fakeBridge.proposeHotkey).not.toHaveBeenCalled();
    fireEvent.keyUp(window, win);
    expect(fakeBridge.proposeHotkey).toHaveBeenCalledWith(["ControlLeft", "MetaLeft"]);
  });

  it("cancels when the window loses focus", async () => {
    await startCapture();
    fireEvent.blur(window);
    expect(fakeBridge.cancelHotkeyCapture).toHaveBeenCalledOnce();
    await screen.findByRole("button", { name: "Change" });
    chord(ctrl, shift);
    expect(fakeBridge.proposeHotkey).not.toHaveBeenCalled();
  });

  it("gives up after fifteen seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startCapture();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(fakeBridge.cancelHotkeyCapture).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("returns to the current shortcut when the shell drops the capture", async () => {
    await startCapture();
    act(() => {
      listeners.captureCancelled?.();
    });
    expect(keys()).toEqual(["Ctrl", "Win"]);
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("explains why a capture could not start", async () => {
    fakeBridge.captureHotkey.mockRejectedValueOnce({
      message: "hotkey.notInSettings",
      backToSignIn: false,
    });
    render(<Settings />);
    await screen.findByText("Win");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect((await screen.findByRole("alert")).textContent).toContain("settings window");
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("turns autostart off and reflects what Windows reports", async () => {
    render(<Settings />);
    const toggle = await screen.findByRole("switch");
    await vi.waitFor(() => {
      expect((toggle as HTMLInputElement).checked).toBe(true);
    });
    fireEvent.click(toggle);
    expect(fakeBridge.setAutostart).toHaveBeenCalledWith(false);
    await vi.waitFor(() => {
      expect((toggle as HTMLInputElement).checked).toBe(false);
    });
  });

  it("signs out and then offers to sign in again", async () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByText("Signed in as sebastian");
    fakeBridge.accountStatus.mockResolvedValue({ signedIn: false, username: null });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(fakeBridge.signOut).toHaveBeenCalledOnce();
    await screen.findByText("Signed out. Sign in to dictate.");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(fakeBridge.openSignIn).toHaveBeenCalledOnce();
    fakeBridge.accountStatus.mockResolvedValue({ signedIn: true, username: "sebastian" });
  });

  it("opens on the section the shell asks for and moves between sections", async () => {
    window.history.replaceState(null, "", "?view=settings&section=account");
    render(<Settings />);
    await screen.findByText("Signed in as sebastian");
    expect(screen.getByRole("button", { name: "Account" }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "General" }));
    await screen.findByText("Win");
    expect(screen.queryByText("Signed in as sebastian")).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  it("follows a session that ends elsewhere", async () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByText("Signed in as sebastian");
    fakeBridge.accountStatus.mockResolvedValueOnce({ signedIn: false, username: null });
    act(() => {
      listeners.accountChanged?.(false);
    });
    await screen.findByText("Signed out. Sign in to dictate.");
  });
});
