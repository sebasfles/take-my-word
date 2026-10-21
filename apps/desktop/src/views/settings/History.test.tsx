import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n.ts";
import { at, builtins, serve } from "../../testing/api.ts";
import { fakeBridge } from "../../testing/bridge.ts";
import { History } from "./History.tsx";

vi.mock("../../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

const dictation = (id: string, day: number, text: string) => ({
  id,
  createdAt: at(day),
  locale: "es-CL",
  text,
  raw: `um ${text.toLowerCase()}`,
  styleId: "casual",
  audioSeconds: 4.4,
});

describe("History", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists pages newest first and loads more with the cursor", async () => {
    const seen = serve({
      listStyles: () => ({ styles: builtins }),
      listDictations: (route) =>
        route.route === "listDictations" && route.cursor === "next"
          ? { items: [dictation("c", 18, "Third.")] }
          : {
              items: [dictation("a", 20, "First."), dictation("b", 19, "Second.")],
              cursor: "next",
            },
    });
    render(<History />);
    await screen.findByText("First.");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Third.");
    const texts = Array.from(
      document.querySelectorAll(".dictation-text"),
      (node) => node.textContent,
    );
    expect(texts).toEqual(["First.", "Second.", "Third."]);
    expect(seen.filter((route) => route.route === "listDictations").at(-1)).toEqual({
      route: "listDictations",
      cursor: "next",
    });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the raw transcript collapsed and shows style and audio length", async () => {
    serve({
      listStyles: () => ({ styles: builtins }),
      listDictations: () => ({ items: [dictation("a", 20, "First.")] }),
    });
    render(<History />);
    const row = (await screen.findByText("First.")).closest("li") as HTMLElement;
    expect(row.querySelector("details")?.open).toBe(false);
    expect(within(row).getByText("um first.")).toBeTruthy();
    expect(within(row).getByText(/^Casual · .* · 4 s of audio$/)).toBeTruthy();
  });

  it("copies through Rust and deletes after confirming", async () => {
    const seen = serve({
      listStyles: () => ({ styles: builtins }),
      listDictations: () => ({ items: [dictation("a", 20, "First.")] }),
    });
    render(<History />);
    const row = (await screen.findByText("First.")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Copy" }));
    expect(fakeBridge.copyText).toHaveBeenCalledWith("First.");
    await within(row).findByRole("button", { name: "Copied" });
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(seen.some((route) => route.route === "deleteDictation")).toBe(false);
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await screen.findByText("You have no dictations yet.");
    expect(seen.at(-1)).toEqual({ route: "deleteDictation", id: "a" });
  });
});
