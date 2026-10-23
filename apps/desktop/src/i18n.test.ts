import { afterEach, describe, expect, it } from "vitest";
import en from "./i18n/en.json";
import es from "./i18n/es.json";
import { languageFromSearch, setLanguage, t } from "./i18n.ts";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);

describe("dictionaries", () => {
  it("have the same message ids in Spanish and English", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it("never leave a message empty or drop a placeholder in one language", () => {
    for (const [id, spanish] of Object.entries(es)) {
      const english = (en as Record<string, string>)[id] ?? "";
      expect(spanish.trim(), id).not.toBe("");
      expect(english.trim(), id).not.toBe("");
      expect(placeholders(english), id).toEqual(placeholders(spanish));
    }
  });
});

describe("language", () => {
  afterEach(() => {
    setLanguage("en");
  });

  it("follows the shell and falls back to English", () => {
    expect(languageFromSearch("?view=main&lang=en")).toBe("en");
    expect(languageFromSearch("?view=main&lang=es")).toBe("es");
    expect(languageFromSearch("?view=main&lang=fr")).toBe("en");
    expect(languageFromSearch("?view=main")).toBe("en");
  });

  it("fills placeholders in the chosen language", () => {
    setLanguage("es");
    expect(t("settings.account.signedInAs", { username: "ana" })).toBe("Sesión iniciada como ana");
    setLanguage("en");
    expect(t("settings.account.signedInAs", { username: "ana" })).toBe("Signed in as ana");
  });
});
