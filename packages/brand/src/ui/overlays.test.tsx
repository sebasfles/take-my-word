import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button.tsx";
import { Dialog } from "./dialog.tsx";
import { ToastRegion, type ToastItem } from "./toast.tsx";

afterEach(cleanup);

function Confirm({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Delete this dictation?"
        description="This cannot be undone."
        actions={
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        }
      />
    </>
  );
}

describe("Dialog", () => {
  it("opens as a modal named and described by its text", async () => {
    render(<Confirm onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this dictation?" });
    expect(dialog).toHaveProperty("open", true);
    const description = document.getElementById(dialog.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("This cannot be undone.");
  });

  it("hands the Escape close request to onClose", async () => {
    const close = vi.fn();
    render(<Confirm onClose={close} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(dialog).toHaveProperty("open", false);
  });
});

describe("ToastRegion", () => {
  const toasts: ToastItem[] = [
    { id: "1", tone: "success", message: "Saved" },
    { id: "2", tone: "error", message: "Could not delete" },
  ];

  it("announces news politely and errors assertively", () => {
    render(
      <ToastRegion
        toasts={toasts}
        onDismiss={vi.fn()}
        label="Notifications"
        dismissLabel="Dismiss"
      />,
    );
    expect(within(screen.getByRole("status")).getByText("Saved")).toBeTruthy();
    expect(within(screen.getByRole("alert")).getByText("Could not delete")).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("dismisses one toast from its own labelled button", async () => {
    const dismiss = vi.fn();
    render(
      <ToastRegion
        toasts={toasts}
        onDismiss={dismiss}
        label="Notifications"
        dismissLabel="Dismiss"
      />,
    );
    const alert = screen.getByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Dismiss" }));
    expect(dismiss).toHaveBeenCalledWith("2");
  });
});
