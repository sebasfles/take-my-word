import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n.ts";
import { at, failure, serve } from "../../testing/api.ts";
import { fakeBridge } from "../../testing/bridge.ts";
import { Dictionary } from "./Dictionary.tsx";

vi.mock("../../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("en");

const kubernetes = {
  id: "a3ViZXJuZXRlcw",
  term: "Kubernetes",
  aliases: ["cubernetes"],
  useCount: 3,
  lastUsedAt: at(20),
  createdAt: at(1),
};

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Dictionary", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("adds a term with its aliases and lists it", async () => {
    const seen = serve({
      listTerms: () => ({ terms: [kubernetes] }),
      addTerm: () => ({
        ...kubernetes,
        id: "dmFscA",
        term: "Valparaíso",
        aliases: ["valpo"],
        useCount: 1,
      }),
    });
    render(<Dictionary focusAdd={0} />);
    await screen.findByText("Kubernetes");
    type("Term", "  Valparaíso ");
    type("Aliases", "valpo, ,");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Valparaíso");
    expect(seen.at(-1)).toEqual({
      route: "addTerm",
      body: { term: "Valparaíso", aliases: ["valpo"] },
    });
    expect(screen.getByText("Used once", { exact: false })).toBeTruthy();
  });

  it("shows the API's duplicate answer as an inline message", async () => {
    serve({
      listTerms: () => ({ terms: [kubernetes] }),
      addTerm: () => {
        throw failure(409, "conflict");
      },
    });
    render(<Dictionary focusAdd={0} />);
    await screen.findByText("Kubernetes");
    type("Term", "kubernetes");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That term is already in your dictionary.",
    );
  });

  it("refuses terms past the shared limits before calling the API", async () => {
    const seen = serve({ listTerms: () => ({ terms: [] }) });
    render(<Dictionary focusAdd={0} />);
    await screen.findByText(/dictionary is empty/);
    type("Term", "x".repeat(65));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Each term and alias takes at most 64 characters.",
    );
    type("Term", "Kubernetes");
    type("Aliases", Array.from({ length: 11 }, (_, index) => `alias${String(index)}`).join(","));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe("A term takes at most 10 aliases.");
    expect(seen.map((route) => route.route)).toEqual(["listTerms"]);
  });

  it("reports a full dictionary when a race passes the count limit", async () => {
    serve({
      listTerms: () => ({ terms: [] }),
      addTerm: () => {
        throw failure(400, "bad_request");
      },
    });
    render(<Dictionary focusAdd={0} />);
    await screen.findByText(/dictionary is empty/);
    type("Term", "Kubernetes");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Your dictionary holds at most 500 terms.",
    );
  });

  it("edits aliases and deletes only after confirming", async () => {
    const seen = serve({
      listTerms: () => ({ terms: [kubernetes] }),
      updateTerm: () => ({ ...kubernetes, aliases: ["kubernetis"] }),
    });
    render(<Dictionary focusAdd={0} />);
    const row = (await screen.findByText("Kubernetes")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(row).getByLabelText("Aliases"), { target: { value: "kubernetis" } });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await within(row).findByText("kubernetis");
    expect(seen.at(-1)).toEqual({
      route: "updateTerm",
      id: kubernetes.id,
      body: { aliases: ["kubernetis"] },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(seen.at(-1)?.route).toBe("updateTerm");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => {
      expect(screen.queryByText("Kubernetes")).toBeNull();
    });
    expect(seen.at(-1)).toEqual({ route: "deleteTerm", id: kubernetes.id });
  });

  it("focuses the term field when asked to add a word", async () => {
    serve({ listTerms: () => ({ terms: [kubernetes] }) });
    const { rerender } = render(<Dictionary focusAdd={0} />);
    await screen.findByText("Kubernetes");
    expect(document.activeElement).not.toBe(screen.getByLabelText("Term"));
    rerender(<Dictionary focusAdd={1} />);
    expect(document.activeElement).toBe(screen.getByLabelText("Term"));
  });
});
