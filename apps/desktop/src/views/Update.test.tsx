import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateView } from "../bridge.ts";
import { setLanguage } from "../i18n.ts";
import { fakeBridge, listeners, pendingUpdate } from "../testing/bridge.ts";
import { Update } from "./Update.tsx";

vi.mock("../bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../bridge.ts")>()),
  bridge: fakeBridge,
}));

setLanguage("es");

const available: UpdateView = {
  version: "0.1.1",
  notes: "Pega más rápido en terminales.",
  phase: "available",
};

async function showing(view: UpdateView) {
  pendingUpdate.view = view;
  render(<Update />);
  await screen.findByRole("heading", { level: 1 });
}

function shell(view: UpdateView) {
  act(() => {
    listeners.update?.(view);
  });
}

describe("Update", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    pendingUpdate.view = null;
    setLanguage("es");
  });

  it("offers the version and its notes, and installs on yes", async () => {
    await showing(available);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Hay una nueva versión de Take My Word",
    );
    screen.getByText("Versión 0.1.1");
    screen.getByText("Pega más rápido en terminales.");
    fireEvent.click(screen.getByRole("button", { name: "Instalar y reiniciar" }));
    expect(fakeBridge.installUpdate).toHaveBeenCalledOnce();
    expect(fakeBridge.postponeUpdate).not.toHaveBeenCalled();
  });

  it("postpones on later", async () => {
    await showing(available);
    fireEvent.click(screen.getByRole("button", { name: "Más tarde" }));
    expect(fakeBridge.postponeUpdate).toHaveBeenCalledOnce();
    expect(fakeBridge.installUpdate).not.toHaveBeenCalled();
  });

  it("speaks English when Windows does", async () => {
    setLanguage("en");
    await showing({ ...available, notes: "" });
    screen.getByRole("heading", { name: "A new version of Take My Word is ready" });
    screen.getByRole("button", { name: "Later" });
    screen.getByRole("button", { name: "Install and restart" });
    expect(screen.queryByRole("heading", { name: "What's new" })).toBeNull();
  });

  it("renders the release notes as plain text", async () => {
    await showing({ ...available, notes: "<img src=x onerror=alert(1)> **bold**\nsecond line" });
    const notes = document.querySelector(".update-notes");
    expect(notes?.textContent).toBe("<img src=x onerror=alert(1)> **bold**\nsecond line");
    expect(notes?.children).toHaveLength(0);
  });

  it("follows the shell through download, install and failure", async () => {
    await showing(available);
    shell({ ...available, phase: "downloading", percent: null });
    expect(screen.getByRole("status").textContent).toBe("Descargando la actualización");
    expect(screen.queryByRole("button")).toBeNull();
    shell({ ...available, phase: "downloading", percent: 40 });
    expect(screen.getByRole("status").textContent).toBe("Descargando la actualización 40%");
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("40");
    shell({ ...available, phase: "installing" });
    expect(screen.getByRole("status").textContent).toBe(
      "Instalando. Take My Word se reiniciará en unos segundos.",
    );
    shell({ ...available, phase: "failed" });
    screen.getByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(fakeBridge.installUpdate).toHaveBeenCalledOnce();
  });

  it("keeps a newer shell event over the view it fetched", async () => {
    let answer: (view: UpdateView) => void = () => undefined;
    fakeBridge.updateView.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    render(<Update />);
    await act(async () => {
      await Promise.resolve();
    });
    shell({ ...available, phase: "downloading", percent: 10 });
    await act(async () => {
      answer(available);
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Descargando la actualización 10%");
  });
});
