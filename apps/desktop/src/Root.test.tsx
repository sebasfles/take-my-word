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

  it("hands every key of an app window to the shell, once per press and release", () => {
    render(<Root language="en" theme={null} forwardsKeys screen={Title} />);
    fakeBridge.forwardKey.mockClear();
    const press = (type: string, init: KeyboardEventInit) => {
      window.dispatchEvent(new KeyboardEvent(type, init));
    };
    press("keydown", { code: "ControlLeft", key: "Control" });
    press("keydown", { code: "ControlLeft", key: "Control", repeat: true });
    press("keydown", { code: "AltRight", key: "AltGraph" });
    press("keyup", { code: "ControlLeft", key: "Control" });
    press("keydown", { code: "", key: "Unidentified" });
    expect(fakeBridge.forwardKey.mock.calls).toEqual([
      ["ControlLeft", true],
      ["AltRight", true],
      ["ControlLeft", false],
    ]);
  });

  it("releases the keys still down when the window loses focus", () => {
    render(<Root language="en" theme={null} forwardsKeys screen={Title} />);
    fakeBridge.forwardKey.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ControlLeft", key: "Control" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "MetaLeft", key: "Meta" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ControlLeft", key: "Control" }));
    window.dispatchEvent(new FocusEvent("blur"));
    window.dispatchEvent(new FocusEvent("blur"));
    expect(fakeBridge.forwardKey.mock.calls).toEqual([
      ["ControlLeft", true],
      ["MetaLeft", true],
      ["ControlLeft", false],
      ["MetaLeft", false],
    ]);
  });

  it("never forwards keys from the overlay", () => {
    render(<Root language="en" theme="light" followsTheme={false} screen={Title} />);
    fakeBridge.forwardKey.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ControlLeft", key: "Control" }));
    expect(fakeBridge.forwardKey).not.toHaveBeenCalled();
  });

  it("reads only a theme it knows from the window's address", () => {
    expect(themeFromSearch("?view=main&theme=dark")).toBe("dark");
    expect(themeFromSearch("?view=main&theme=light")).toBe("light");
    expect(themeFromSearch("?view=main&theme=sepia")).toBeNull();
    expect(themeFromSearch("?view=main")).toBeNull();
  });
});
