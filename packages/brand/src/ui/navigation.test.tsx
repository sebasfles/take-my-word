import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NavItem, Tabs } from "./tabs.tsx";

afterEach(cleanup);

function Sections() {
  const [selected, setSelected] = useState("built-in");
  return (
    <Tabs
      label="Styles"
      selected={selected}
      onSelect={setSelected}
      tabs={[
        { id: "built-in", label: "Built-in", panel: "Plain, casual, formal" },
        { id: "yours", label: "Yours", panel: "Short Slack" },
        { id: "archived", label: "Archived", panel: "Nothing here" },
      ]}
    />
  );
}

describe("Tabs", () => {
  it("keeps one tab in the tab order and shows its panel", async () => {
    render(<Sections />);
    await userEvent.tab();
    const first = screen.getByRole("tab", { name: "Built-in" });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel", { name: "Built-in" });
    expect(panel.textContent).toBe("Plain, casual, formal");
    expect(first.getAttribute("aria-controls")).toBe(panel.id);
    await userEvent.tab();
    expect(document.activeElement).toBe(panel);
  });

  it("moves with the arrows, wraps, and jumps with Home and End", async () => {
    render(<Sections />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Yours" }));
    expect(screen.getByRole("tabpanel").textContent).toBe("Short Slack");
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Archived" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Built-in" }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Archived" }));
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Built-in" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });
});

describe("NavItem", () => {
  it("marks only the current page", () => {
    render(
      <nav>
        <NavItem href="/app" current={false}>
          Account
        </NavItem>
        <NavItem href="/app/history" current>
          History
        </NavItem>
      </nav>,
    );
    expect(screen.getByRole("link", { name: "History" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Account" }).hasAttribute("aria-current")).toBe(false);
  });
});
