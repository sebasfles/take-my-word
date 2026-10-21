import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button.tsx";
import { Checkbox, Select, TextArea, TextInput } from "./field.tsx";
import { Toggle } from "./toggle.tsx";

afterEach(cleanup);

describe("Button", () => {
  it("does not submit forms unless asked to", async () => {
    const submit = vi.fn((event: SubmitEvent) => {
      event.preventDefault();
    });
    render(
      <form
        onSubmit={(event) => {
          submit(event.nativeEvent);
        }}
      >
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Plain" }));
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("is busy and inert while loading", async () => {
    const click = vi.fn();
    render(
      <Button loading onClick={click}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });

  it("is reachable with Tab and activated with Enter and Space", async () => {
    const click = vi.fn();
    render(<Button onClick={click}>Go</Button>);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Go" }));
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(click).toHaveBeenCalledTimes(2);
  });
});

describe("fields", () => {
  it("label their control and describe it with the hint and the error", () => {
    render(
      <TextInput label="Username" hint="As in your invitation" error="Required" defaultValue="" />,
    );
    const input = screen.getByLabelText("Username");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["As in your invitation", "Required"]);
  });

  it("leave a valid control unmarked", () => {
    render(<TextArea label="Prompt" />);
    const area = screen.getByLabelText("Prompt");
    expect(area.hasAttribute("aria-invalid")).toBe(false);
    expect(area.hasAttribute("aria-describedby")).toBe(false);
  });

  it("let the keyboard pick an option of a select", async () => {
    render(
      <Select label="Sort by" defaultValue="relevance">
        <option value="relevance">Relevance</option>
        <option value="name">Name</option>
      </Select>,
    );
    const select = screen.getByLabelText<HTMLSelectElement>("Sort by");
    await userEvent.selectOptions(select, "name");
    expect(select.value).toBe("name");
  });

  it("toggle a checkbox from its label and from the keyboard", async () => {
    render(<Checkbox label="Remember me" />);
    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Remember me" });
    await userEvent.click(screen.getByText("Remember me"));
    expect(box.checked).toBe(true);
    box.focus();
    await userEvent.keyboard(" ");
    expect(box.checked).toBe(false);
  });
});

function ControlledToggle({ onChange }: { onChange: (value: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Toggle
      label="Dark theme"
      checked={checked}
      onChange={(value) => {
        setChecked(value);
        onChange(value);
      }}
    />
  );
}

describe("Toggle", () => {
  it("is a switch named by its label that reports its state", async () => {
    const change = vi.fn();
    render(<ControlledToggle onChange={change} />);
    const toggle = screen.getByRole("switch", { name: "Dark theme" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(screen.getByText("Dark theme"));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    toggle.focus();
    await userEvent.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(change.mock.calls).toEqual([[true], [false]]);
  });
});
