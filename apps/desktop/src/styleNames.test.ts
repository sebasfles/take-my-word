import { describe, expect, it } from "vitest";
import { setLanguage } from "./i18n.ts";
import { styleLabel } from "./styleNames.ts";

describe("styleLabel", () => {
  it("names built-ins from the dictionaries even without the style list", () => {
    setLanguage("es");
    expect(styleLabel("plain", [])).toBe("Neutro");
    expect(styleLabel(undefined, [])).toBe("Estilo predeterminado");
    expect(styleLabel("c7d1", [])).toBe("Estilo eliminado");
    expect(styleLabel("c7d1", [{ id: "c7d1", name: "Correos", builtin: false }])).toBe("Correos");
  });
});
