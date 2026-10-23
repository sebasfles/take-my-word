import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n.ts";
import { styleExamples } from "../../styleExamples.ts";
import { fakeBridge, listeners, onboarding } from "../../testing/bridge.ts";
import { Onboarding } from "./Onboarding.tsx";
import type { StepId } from "./plan.ts";

vi.mock("../../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

const everything: StepId[] = [
  "welcome",
  "signIn",
  "microphone",
  "hotkey",
  "languages",
  "context",
  "style",
  "ready",
];

const next = () => {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
};

function signIn() {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "sebastian" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("Onboarding", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("takes a fresh install through every step in one window and ends set up", async () => {
    const done = vi.fn();
    render(<Onboarding plan={everything} onDone={done} />);
    expect(screen.getByText("Step 1 of 8")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    signIn();
    await screen.findByRole("heading", { name: "Check your microphone" });
    await vi.waitFor(() => {
      expect(fakeBridge.checkMicrophone).toHaveBeenLastCalledWith(true);
    });
    next();
    await screen.findByRole("heading", { name: "Two ways to dictate" });
    await vi.waitFor(() => {
      expect(fakeBridge.checkMicrophone).toHaveBeenLastCalledWith(false);
    });
    expect(screen.getByLabelText("Practice here")).toBeTruthy();
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: "English" }));
    next();
    await screen.findByRole("heading", { name: "What do you do?" });
    expect(document.querySelector(".visual-context")?.textContent).toContain(
      "I opened a PR and the CI is green.",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Software development" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Data and AI" }));
    fireEvent.change(screen.getByLabelText("Anything more specific? (optional)"), {
      target: { value: "backend with AWS" },
    });
    next();
    const example = styleExamples.en;
    expect(screen.getByText(example.said)).toBeTruthy();
    const shown = Array.from(
      document.querySelectorAll(".example-text"),
      (text) => text.textContent,
    );
    expect(shown).toEqual(Object.values(example.styles));
    fireEvent.click(screen.getByRole("radio", { name: "Formal" }));
    next();
    await screen.findByRole("heading", { name: "You're ready" });
    expect(fakeBridge.saveOnboarding).toHaveBeenCalledWith("formal", ["es", "en"], {
      picks: ["software-development", "data-ai"],
      detail: "backend with AWS",
    });
    fireEvent.click(screen.getByRole("button", { name: "Start dictating" }));
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledOnce();
    });
    expect(fakeBridge.finishOnboarding).toHaveBeenCalledOnce();
  });

  it("lets a returning user in right after signing in when nothing else is missing", async () => {
    fakeBridge.signIn.mockResolvedValueOnce("done");
    const done = vi.fn();
    render(<Onboarding plan={["signIn", "languages", "style"]} onDone={done} />);
    signIn();
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledOnce();
    });
    expect(fakeBridge.onboarding).not.toHaveBeenCalled();
    expect(fakeBridge.finishOnboarding).not.toHaveBeenCalled();
  });

  it("asks a first sign-in for its own password before going on", async () => {
    fakeBridge.signIn.mockResolvedValueOnce("choosePassword");
    render(<Onboarding plan={everything.slice(1)} onDone={vi.fn()} />);
    signIn();
    await screen.findByRole("heading", { name: "Choose your password" });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Abcdefgh1234" } });
    fireEvent.change(screen.getByLabelText("Repeat the password"), {
      target: { value: "Abcdefgh1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await screen.findByRole("heading", { name: "Check your microphone" });
  });

  it("shows the live level and the blocked microphone state", async () => {
    render(<Onboarding plan={["microphone", "ready"]} onDone={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      listeners.microphoneLevel?.(0.8);
    });
    const bars = Array.from(document.querySelectorAll<HTMLElement>(".waveform-bar"), (bar) =>
      bar.style.getPropertyValue("--level"),
    );
    expect(bars.at(-1)).toBe("0.8");
    act(() => {
      listeners.microphoneStatus?.("denied");
    });
    fireEvent.click(screen.getByRole("button", { name: "Open microphone settings" }));
    expect(fakeBridge.openMicrophoneSettings).toHaveBeenCalledOnce();
  });

  it("takes at most three picks and keeps the stored context when skipped", async () => {
    fakeBridge.onboarding.mockResolvedValueOnce({
      ...onboarding,
      context: { picks: ["law"], detail: "contracts" },
    });
    render(<Onboarding plan={["languages", "context", "style"]} onDone={vi.fn()} />);
    await screen.findByRole("checkbox", { name: "Español" });
    next();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Law" }).checked).toBe(true);
    expect(screen.getByDisplayValue("contracts")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sales" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Design" }));
    expect(screen.getByText("3 of 3 chosen")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Student" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish" }));
    await vi.waitFor(() => {
      expect(fakeBridge.saveOnboarding).toHaveBeenCalledWith("plain", ["es"], {
        picks: ["law"],
        detail: "contracts",
      });
    });
  });

  it("goes back to sign-in when the session ends while saving the style", async () => {
    fakeBridge.saveOnboarding.mockRejectedValueOnce(
      Object.assign(new Error("account.sessionEnded"), {
        message: "account.sessionEnded",
        backToSignIn: true,
      }),
    );
    render(<Onboarding plan={["languages", "style"]} onDone={vi.fn()} />);
    await screen.findByRole("checkbox", { name: "Español" });
    next();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.getByRole("alert").textContent).toBe("Your session ended. Sign in again.");
  });
});
