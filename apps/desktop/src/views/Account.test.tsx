import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n.ts";
import { fakeBridge } from "../testing/bridge.ts";
import { Account } from "./Account.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function signIn(username = "sebastian", password = "Temporary 123") {
  type("Username", username);
  type("Password", password);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("Account", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?view=account");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("signs in, then saves the picked style with the current default preselected", async () => {
    render(<Account />);
    signIn();
    expect(fakeBridge.signIn).toHaveBeenCalledWith("sebastian", "Temporary 123");
    const plain = await screen.findByRole("radio", { name: "Plain" });
    expect((plain as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Casual" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fakeBridge.saveDefaultStyle).toHaveBeenCalledWith("casual");
  });

  it("shows wrong credentials and stays on sign-in", async () => {
    fakeBridge.signIn.mockRejectedValueOnce({
      message: "account.wrongCredentials",
      backToSignIn: false,
    });
    render(<Account />);
    signIn("sebastian", "nope");
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong username or password.");
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });

  it("asks for a new password, refuses a mismatch locally, and continues to onboarding", async () => {
    fakeBridge.signIn.mockResolvedValueOnce("choosePassword");
    render(<Account />);
    signIn();
    await screen.findByRole("heading", { name: "Choose your password" });
    type("New password", "Chosen password 123");
    type("Repeat the password", "Chosen password 124");
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The passwords do not match.");
    expect(fakeBridge.choosePassword).not.toHaveBeenCalled();
    type("Repeat the password", "Chosen password 123");
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    expect(fakeBridge.choosePassword).toHaveBeenCalledWith("Chosen password 123");
    await screen.findByRole("heading", { name: "Pick your style" });
  });

  it("returns to sign-in with the reason when the challenge expired", async () => {
    fakeBridge.signIn.mockResolvedValueOnce("choosePassword");
    fakeBridge.choosePassword.mockRejectedValueOnce({
      message: "account.expired",
      backToSignIn: true,
    });
    render(<Account />);
    signIn();
    await screen.findByRole("heading", { name: "Choose your password" });
    type("New password", "Chosen password 123");
    type("Repeat the password", "Chosen password 123");
    fireEvent.click(screen.getByRole("button", { name: "Save and sign in" }));
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.getByRole("alert").textContent).toContain("expired");
  });

  it("opens straight on onboarding and retries when the styles do not load", async () => {
    window.history.replaceState(null, "", "/?view=account&step=onboarding");
    fakeBridge.onboarding.mockRejectedValueOnce({
      message: "account.unreachable",
      backToSignIn: false,
    });
    render(<Account />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not reach");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("radio", { name: "Formal" });
    expect(fakeBridge.onboarding).toHaveBeenCalledTimes(2);
  });

  it("names built-in styles in the app's language and custom styles by their own name", async () => {
    setLanguage("es");
    window.history.replaceState(null, "", "/?view=account&step=onboarding");
    render(<Account />);
    await screen.findByRole("radio", { name: "Neutro" });
    expect(screen.getByRole("radio", { name: "Client emails" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Plain" })).toBeNull();
    setLanguage("en");
  });
});
