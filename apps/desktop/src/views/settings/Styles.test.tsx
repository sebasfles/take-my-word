import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n.ts";
import { builtins, failure, serve, settings } from "../../testing/api.ts";
import { fakeBridge } from "../../testing/bridge.ts";
import { Styles } from "./Styles.tsx";

vi.mock("../../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

const mail = { id: "c7d1", name: "Client email", prompt: "Formal, short.", builtin: false };

describe("Styles", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("describes built-ins with the app's copy, never their prompt", async () => {
    serve({ listStyles: () => ({ styles: [...builtins, mail] }), getSettings: () => settings });
    render(<Styles />);
    await screen.findByText("Your styles");
    expect(screen.getAllByText("For chats: friendly and direct.").length).toBeGreaterThan(0);
    expect(screen.queryByText(builtins[1]?.prompt ?? "")).toBeNull();
  });

  it("saves the default style by reading the settings again and replacing them whole", async () => {
    const stored = { ...settings, locale: "en-US" };
    const seen = serve({
      listStyles: () => ({ styles: [...builtins, mail] }),
      getSettings: () => stored,
      replaceSettings: (route) => (route.route === "replaceSettings" ? route.body : null),
    });
    render(<Styles />);
    fireEvent.click(await screen.findByRole("radio", { name: "Client email" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");
    expect(seen.slice(-2)).toEqual([
      { route: "getSettings" },
      { route: "replaceSettings", body: { ...stored, defaultStyleId: "c7d1" } },
    ]);
  });

  it("creates a style after checking name and prompt locally", async () => {
    const seen = serve({
      listStyles: () => ({ styles: builtins }),
      getSettings: () => settings,
      createStyle: () => mail,
    });
    render(<Styles />);
    await screen.findByText("You have no styles of your own yet.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Client email" } });
    fireEvent.click(screen.getByRole("button", { name: "Create style" }));
    expect(screen.getByRole("alert").textContent).toBe("Type the instructions.");
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "x".repeat(2001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create style" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "The instructions take at most 2000 characters.",
    );
    expect(seen.some((route) => route.route === "createStyle")).toBe(false);
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: " Formal, short. " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create style" }));
    await screen.findByText("Formal, short.");
    expect(seen.at(-1)).toEqual({
      route: "createStyle",
      body: { name: "Client email", prompt: "Formal, short." },
    });
  });

  it("explains a create refused past the 20 styles", async () => {
    serve({
      listStyles: () => ({ styles: builtins }),
      getSettings: () => settings,
      createStyle: () => {
        throw failure(400, "bad_request");
      },
    });
    render(<Styles />);
    await screen.findByText("You have no styles of your own yet.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Mail" } });
    fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Short." } });
    fireEvent.click(screen.getByRole("button", { name: "Create style" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You can keep at most 20 styles of your own.",
    );
  });

  it("deleting the default style moves the picker back to Plain", async () => {
    serve({
      listStyles: () => ({ styles: [...builtins, mail] }),
      getSettings: () => ({ ...settings, defaultStyleId: "c7d1" }),
    });
    render(<Styles />);
    const picked = await screen.findByRole("radio", { name: "Client email" });
    expect((picked as HTMLInputElement).checked).toBe(true);
    const row = screen.getByText("Formal, short.").closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("radio", { name: "Client email" })).toBeNull();
    });
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Plain" }).checked).toBe(true);
  });
});
