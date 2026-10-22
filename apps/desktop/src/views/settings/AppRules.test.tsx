import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n.ts";
import { builtins, failure, serve } from "../../testing/api.ts";
import { fakeBridge } from "../../testing/bridge.ts";
import { AppRules } from "./AppRules.tsx";

vi.mock("../../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

const mail = { id: "c7d1", name: "Client email", prompt: "Formal, short.", builtin: false };
const rules = [
  { id: "b3V0", appId: "outlook.exe", styleId: "c7d1", keystroke: "ctrl+v" },
  { id: "c2xh", appId: "slack.exe", styleId: "gone", keystroke: "cmd+v" },
  { id: "dGVy", appId: "windowsterminal.exe", keystroke: "ctrl+shift+v" },
];

describe("AppRules", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("names each rule's style, a deleted one and the default, and its keystroke", async () => {
    serve({ listAppRules: () => ({ rules }), listStyles: () => ({ styles: [...builtins, mail] }) });
    render(<AppRules />);
    const row = (app: string) => screen.getByText(app).closest("li") as HTMLElement;
    await screen.findByText("outlook.exe");
    expect(within(row("outlook.exe")).getByText("Client email · Ctrl+V")).toBeTruthy();
    expect(within(row("slack.exe")).getByText("Deleted style · Ctrl+V")).toBeTruthy();
    expect(
      within(row("windowsterminal.exe")).getByText("Default style · Ctrl+Shift+V"),
    ).toBeTruthy();
  });

  it("adds a rule for a running app with its style and keystroke", async () => {
    const created = {
      id: "bm90",
      appId: "notepad.exe",
      styleId: "c7d1",
      keystroke: "shift+insert",
    };
    const seen = serve({
      listAppRules: () => ({ rules: [] }),
      listStyles: () => ({ styles: [...builtins, mail] }),
      createAppRule: () => created,
    });
    render(<AppRules />);
    await screen.findByText(/No rules yet/);
    await vi.waitFor(() => {
      expect(document.querySelectorAll("datalist option")).toHaveLength(2);
    });
    fireEvent.change(screen.getByLabelText("App"), { target: { value: " Notepad.EXE " } });
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "c7d1" } });
    fireEvent.change(screen.getByLabelText("Paste shortcut"), {
      target: { value: "shift+insert" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await screen.findByText("notepad.exe");
    expect(seen.at(-1)).toEqual({
      route: "createAppRule",
      body: { appId: "notepad.exe", styleId: "c7d1", keystroke: "shift+insert" },
    });
  });

  it("refuses an app that already has a rule, locally and from the API", async () => {
    const seen = serve({
      listAppRules: () => ({ rules }),
      listStyles: () => ({ styles: builtins }),
      createAppRule: () => {
        throw failure(409, "conflict");
      },
    });
    render(<AppRules />);
    await screen.findByText("outlook.exe");
    fireEvent.change(screen.getByLabelText("App"), { target: { value: "Outlook.exe" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByRole("alert").textContent).toBe("That app already has a rule.");
    expect(seen.some((route) => route.route === "createAppRule")).toBe(false);
    fireEvent.change(screen.getByLabelText("App"), { target: { value: "code.exe" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await vi.waitFor(() => {
      expect(seen.at(-1)?.route).toBe("createAppRule");
    });
    expect((await screen.findByRole("alert")).textContent).toBe("That app already has a rule.");
  });

  it("moves a rule back to the default style by leaving the style out", async () => {
    const seen = serve({
      listAppRules: () => ({ rules }),
      listStyles: () => ({ styles: [...builtins, mail] }),
      updateAppRule: () => ({ id: "b3V0", appId: "outlook.exe", keystroke: "ctrl+v" }),
    });
    render(<AppRules />);
    const row = (await screen.findByText("outlook.exe")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(row).getByLabelText("Style"), { target: { value: "" } });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await within(row).findByText("Default style · Ctrl+V");
    expect(seen.at(-1)).toEqual({
      route: "updateAppRule",
      id: "b3V0",
      body: { keystroke: "ctrl+v" },
    });
  });
});
