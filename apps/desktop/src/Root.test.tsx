import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBridge, listeners } from "./testing/bridge.ts";
import { setLanguage, t } from "./i18n.ts";
import { Root } from "./Root.tsx";
import { themeFromSearch } from "./theme.ts";

vi.mock("./bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge.ts")>()),
  bridge: fakeBridge,
}));

function Title() {
  return <h1>{t("settings.general.intro")}</h1>;
}

const theme = () => document.documentElement.dataset.theme;

describe("Root", () => {
  afterEach(() => {
    cleanup();
    setLanguage("en");
    delete document.documentElement.dataset.theme;
    delete listeners.theme;
  });

  it("switches every string at once when the shell announces a new language", async () => {
    render(<Root language="es" theme={null} screen={Title} />);
    expect(screen.getByRole("heading").textContent).toBe("Mantén el atajo, habla y suelta.");
    await act(async () => {
      await Promise.resolve();
      listeners.uiLanguage?.("en");
    });
    expect(screen.getByRole("heading").textContent).toBe("Hold the shortcut, speak, release.");
    expect(document.documentElement.lang).toBe("en");
  });

  it("opens in the chosen theme and follows every change the shell announces", async () => {
    render(<Root language="en" theme="dark" screen={Title} />);
    expect(theme()).toBe("dark");
    await act(async () => {
      await Promise.resolve();
      listeners.theme?.("light");
    });
    expect(theme()).toBe("light");
    act(() => {
      listeners.theme?.(null);
    });
    expect(theme()).toBeUndefined();
  });

  it("keeps the overlay on its own theme whatever the shell chooses", async () => {
    render(<Root language="en" theme="light" followsTheme={false} screen={Title} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(listeners.theme).toBeUndefined();
    expect(theme()).toBe("light");
  });

  it("reads only a theme it knows from the window's address", () => {
    expect(themeFromSearch("?view=settings&theme=dark")).toBe("dark");
    expect(themeFromSearch("?view=settings&theme=light")).toBe("light");
    expect(themeFromSearch("?view=settings&theme=sepia")).toBeNull();
    expect(themeFromSearch("?view=settings")).toBeNull();
  });
});
