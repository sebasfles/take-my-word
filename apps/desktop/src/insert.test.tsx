import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBridge, listeners } from "./testing/bridge.ts";
import { Root } from "./Root.tsx";

vi.mock("./bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge.ts")>()),
  bridge: fakeBridge,
}));

function Fields() {
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
      <input aria-label="email" type="email" />
      <button type="button">elsewhere</button>
    </>
  );
}

async function dictate(text: string) {
  await act(async () => {
    await Promise.resolve();
    listeners.insertText?.({ id: 4, text });
  });
}

describe("dictations into the app's own window", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function start(focus: string) {
    render(<Root language="en" theme={null} forwardsKeys screen={Fields} />);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const element = screen.getByLabelText(focus);
    element.focus();
    return element;
  }

  it("land at the caret of the focused field, reach the view's state and are acknowledged", async () => {
    const box = start("practice") as HTMLTextAreaElement;
    box.setSelectionRange(5, 5);
    await dictate("mundo.");
    expect(screen.getByTestId("state").textContent).toBe("Hola mundo.");
    expect(fakeBridge.insertAck).toHaveBeenCalledWith(4, true);
  });

  it("are refused when the focus is not on a field that takes text at a caret", async () => {
    start("email");
    await dictate("a@b.cl");
    expect(fakeBridge.insertAck).toHaveBeenCalledWith(4, false);
    render(<button type="button">alone</button>);
    screen.getByRole("button", { name: "alone" }).focus();
    await dictate("hola");
    expect(fakeBridge.insertAck).toHaveBeenLastCalledWith(4, false);
  });

  it("are refused when inserting throws", async () => {
    start("practice");
    vi.spyOn(HTMLTextAreaElement.prototype, "setRangeText").mockImplementation(() => {
      throw new DOMException("not now", "InvalidStateError");
    });
    await dictate("mundo.");
    expect(fakeBridge.insertAck).toHaveBeenCalledWith(4, false);
    expect(screen.getByTestId("state").textContent).toBe("Hola ");
  });
});
