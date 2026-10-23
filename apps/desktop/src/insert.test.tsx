import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBridge, listeners } from "./testing/bridge.ts";
import { Root } from "./Root.tsx";

vi.mock("./bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge.ts")>()),
  bridge: fakeBridge,
}));

function Field() {
  const [value, setValue] = useState("Hola ");
  return (
    <>
      <textarea
        aria-label="practice"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <p data-testid="state">{value}</p>
      <button type="button">elsewhere</button>
    </>
  );
}

describe("dictations into the app's own window", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("land at the caret of the focused field and reach the view's state", async () => {
    render(<Root language="en" theme={null} forwardsKeys screen={Field} />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("practice");
    box.focus();
    box.setSelectionRange(5, 5);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    await act(async () => {
      await Promise.resolve();
      listeners.insertText?.("mundo.");
    });
    expect(screen.getByTestId("state").textContent).toBe("Hola mundo.");
    expect(fakeBridge.keepDictation).not.toHaveBeenCalled();
  });

  it("stay on the clipboard when no field has focus", async () => {
    render(<Root language="en" theme={null} forwardsKeys screen={Field} />);
    fireEvent.focus(screen.getByRole("button", { name: "elsewhere" }));
    screen.getByRole("button", { name: "elsewhere" }).focus();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    await act(async () => {
      await Promise.resolve();
      listeners.insertText?.("mundo.");
    });
    expect(fakeBridge.keepDictation).toHaveBeenCalledWith("mundo.");
    expect(screen.getByTestId("state").textContent).toBe("Hola ");
  });
});
