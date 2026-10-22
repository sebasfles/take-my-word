import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBridge, listeners } from "./testing/bridge.ts";
import { setLanguage, t } from "./i18n.ts";
import { LanguageRoot } from "./LanguageRoot.tsx";

vi.mock("./bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge.ts")>()),
  bridge: fakeBridge,
}));

function Title() {
  return <h1>{t("settings.general.intro")}</h1>;
}

describe("LanguageRoot", () => {
  afterEach(() => {
    cleanup();
    setLanguage("en");
  });

  it("switches every string at once when the shell announces a new language", async () => {
    render(<LanguageRoot initial="es" screen={Title} />);
    expect(screen.getByRole("heading").textContent).toBe("Mantén el atajo, habla y suelta.");
    await act(async () => {
      await Promise.resolve();
      listeners.uiLanguage?.("en");
    });
    expect(screen.getByRole("heading").textContent).toBe("Hold the shortcut, speak, release.");
    expect(document.documentElement.lang).toBe("en");
  });
});
