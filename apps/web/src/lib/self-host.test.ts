import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dictionary, locales } from "./i18n.ts";
import { checkedOnText, inlineCode, pricesCheckedOn } from "./self-host.ts";

const readme = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "..", "self-host", "README.md"),
  "utf8",
);

function quotedNumbers(locale: (typeof locales)[number]): string[] {
  const cost = dictionary(locale).landing.selfHost.cost;
  const text = [...cost.rows.flatMap((row) => [row.price, row.note]), cost.example].join(" ");
  return [...new Set(text.match(/\d+(\.\d+)?/g) ?? [])].sort();
}

describe("the landing's cost", () => {
  it("quotes the same numbers in English and Spanish", () => {
    expect(quotedNumbers("es")).toEqual(quotedNumbers("en"));
  });

  it.each(quotedNumbers("en"))("quotes %s as self-host/README.md does", (value) => {
    expect(readme).toMatch(new RegExp(`(^|[^\\d.])${value.replace(".", "\\.")}([^\\d]|$)`));
  });

  it("is dated like self-host/README.md", () => {
    expect(readme).toContain(`Prices checked on ${pricesCheckedOn}`);
    expect(checkedOnText("en")).toBe("October 23, 2026");
    expect(checkedOnText("es")).toBe("23 de octubre de 2026");
  });

  it.each(locales)("links every price to its provider page in %s", (locale) => {
    for (const row of dictionary(locale).landing.selfHost.cost.rows) {
      expect(row.links.length).toBeGreaterThan(0);
      for (const link of row.links) expect(readme).toContain(link.href);
    }
  });
});

describe("inlineCode", () => {
  it("marks the text between backticks as code", () => {
    expect(inlineCode("Type `/self-host` or run `pnpm selfhost`.")).toEqual([
      { code: false, text: "Type " },
      { code: true, text: "/self-host" },
      { code: false, text: " or run " },
      { code: true, text: "pnpm selfhost" },
      { code: false, text: "." },
    ]);
  });
});
