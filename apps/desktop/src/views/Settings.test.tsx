import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n.ts";
import { fakeBridge, listeners } from "../testing/bridge.ts";
import { Settings } from "./Settings.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

const rerun = vi.fn();
const dismiss = vi.fn();

const shortcut = () => screen.findByRole("region", { name: "Shortcut" });

function keys() {
  const row = screen.getByRole("region", { name: "Shortcut" });
  return Array.from(row.querySelectorAll("kbd"), (key) => key.textContent);
}

async function startCapture() {
  render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
  await within(await shortcut()).findByText("Win");
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

  it("ends a capture when the user leaves the section", async () => {
    await startCapture();
    chord(ctrl, shift);
    await screen.findByRole("button", { name: "Save" });
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(fakeBridge.cancelHotkeyCapture).toHaveBeenCalledOnce();
    expect(fakeBridge.confirmHotkey).not.toHaveBeenCalled();
  });

  it("leaves Rust alone when the user leaves the section without capturing", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    await within(await shortcut()).findByText("Win");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(fakeBridge.cancelHotkeyCapture).not.toHaveBeenCalled();
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
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    await within(await shortcut()).findByText("Win");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect((await screen.findByRole("alert")).textContent).toContain("settings window");
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("turns autostart off and reflects what Windows reports", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    const toggle = await screen.findByRole("switch", { name: "Start with Windows" });
    await vi.waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });
    fireEvent.click(toggle);
    expect(fakeBridge.setAutostart).toHaveBeenCalledWith(false);
    await vi.waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });
  });

  it("signs out and then offers to sign in again", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
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
    window.history.replaceState(null, "", "?view=main&section=account");
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    await screen.findByText("Signed in as sebastian");
    expect(screen.getByRole("button", { name: "Account" }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "General" }));
    await within(await shortcut()).findByText("Win");
    expect(screen.queryByText("Signed in as sebastian")).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  it("moves an open window to the dictionary with the add field focused", async () => {
    fakeBridge.apiRequest.mockImplementation((route) =>
      Promise.resolve(route.route === "listTerms" ? { terms: [] } : null),
    );
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    await within(await shortcut()).findByText("Win");
    act(() => {
      listeners.mainNavigate?.("&section=dictionary&focus=add");
    });
    await screen.findByRole("heading", { name: "Dictionary" });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Word as it must be written"));
    });
    fakeBridge.apiRequest.mockRestore();
  });

  it("adds a dictation language by reading the settings again and replacing them whole", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    const english = await screen.findByRole("checkbox", { name: "English" });
    fireEvent.click(english);
    await screen.findByText("Saved.");
    const routes = fakeBridge.apiRequest.mock.calls.map(([route]) => route);
    expect(routes.at(-2)).toEqual({ route: "getSettings" });
    expect(routes.at(-1)).toMatchObject({
      route: "replaceSettings",
      body: { defaultStyleId: "plain", dictationLanguages: ["es", "en"] },
    });
  });

  it("offers Windows' language, English and Spanish for the app and saves the choice", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    const select = await screen.findByLabelText("App language");
    await vi.waitFor(() => {
      expect((select as HTMLSelectElement).disabled).toBe(false);
    });
    expect(screen.getByRole("option", { name: "Windows language (Español)" })).toBeTruthy();
    fireEvent.change(select, { target: { value: "en" } });
    expect(fakeBridge.setUiLanguage).toHaveBeenCalledWith("en");
    fireEvent.change(select, { target: { value: "windows" } });
    expect(fakeBridge.setUiLanguage).toHaveBeenLastCalledWith(null);
  });

  it("saves the theme and offers Windows' choice back", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    const windows = await screen.findByRole<HTMLInputElement>("radio", { name: "Windows" });
    await vi.waitFor(() => {
      expect(windows.checked).toBe(true);
    });
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(fakeBridge.setTheme).toHaveBeenCalledWith("dark");
    await vi.waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("radio", { name: "Dark" }).checked).toBe(true);
    });
    fireEvent.click(windows);
    expect(fakeBridge.setTheme).toHaveBeenLastCalledWith(null);
  });

  it("announces hands-free to an upgraded user and hands the dismissal up", async () => {
    render(<Settings handsFreeNote onDismissNote={dismiss} onRerun={rerun} />);
    await screen.findByText("Hands-free dictation");
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("explains both gestures and reruns the setup guide from General", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    await screen.findByText("Hold it to talk, or tap it twice for hands-free.");
    expect(screen.getByRole("heading", { name: "Hands-free" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the guide" }));
    expect(rerun).toHaveBeenCalledOnce();
  });

  it("shows the installed version in About", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    await screen.findByText("Version 0.2.0");
    expect(screen.getByRole("region", { name: "About Take My Word" })).toBeTruthy();
  });

  it("follows a session that ends elsewhere", async () => {
    render(<Settings handsFreeNote={false} onDismissNote={dismiss} onRerun={rerun} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByText("Signed in as sebastian");
    fakeBridge.accountStatus.mockResolvedValueOnce({ signedIn: false, username: null });
    act(() => {
      listeners.accountChanged?.(false);
    });
    await screen.findByText("Signed out. Sign in to dictate.");
  });
});
