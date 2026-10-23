import type { DictionaryTerm, Style } from "@take-my-word/shared";
import { describe, expect, it } from "vitest";
import {
  bothLoaded,
  contextText,
  formatDate,
  formatDateTime,
  formatSeconds,
  historyView,
  languageList,
  languageName,
  nextHistoryHref,
  sortTerms,
  styleLabel,
  termSort,
  usageMinutes,
} from "./account.ts";
import { dictionary } from "./i18n.ts";

const now = new Date("2026-10-21T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function term(name: string, useCount: number, days: number): DictionaryTerm {
  return {
    id: name,
    term: name,
    aliases: [],
    useCount,
    lastUsedAt: daysAgo(days),
    createdAt: daysAgo(400),
  };
}

const styles: Style[] = [
  { id: "plain", name: "Plain", prompt: "", builtin: true },
  { id: "casual", name: "Casual", prompt: "x", builtin: true },
  { id: "formal", name: "Formal", prompt: "y", builtin: true },
  { id: "c1", name: "Slack corto", prompt: "Corto y sin saludos.", builtin: false },
];

describe("styleLabel", () => {
  const es = dictionary("es").styles;
  const en = dictionary("en").styles;

  it("names built-ins by id in the page's language, never with the API's English name", () => {
    expect(styleLabel("plain", styles, es)).toEqual({ name: "Neutro", fallback: false });
    expect(styleLabel("plain", styles, en)).toEqual({ name: "Plain", fallback: false });
    expect(styleLabel("formal", [], es)).toEqual({ name: "Formal", fallback: false });
  });

  it("names a custom style by its own name", () => {
    expect(styleLabel("c1", styles, es)).toEqual({ name: "Slack corto", fallback: false });
  });

  it("calls a dangling id a deleted style and a missing one the default style", () => {
    expect(styleLabel("gone", styles, es)).toEqual({ name: "Estilo eliminado", fallback: true });
    expect(styleLabel(undefined, styles, en)).toEqual({ name: "Default style", fallback: true });
  });
});

describe("sortTerms", () => {
  const terms = [
    term("Zeta", 1, 0),
    term("alfa", 40, 180),
    term("Ñandú", 6, 1),
    term("beta", 6, 1),
  ];

  it("orders by the decayed score the API uses, ties by recent use then by term", () => {
    expect(sortTerms(terms, "relevance", now, "es").map((entry) => entry.term)).toEqual([
      "beta",
      "Ñandú",
      "Zeta",
      "alfa",
    ]);
  });

  it("orders by name ignoring case and accents in the page's language", () => {
    expect(sortTerms(terms, "name", now, "es").map((entry) => entry.term)).toEqual([
      "alfa",
      "beta",
      "Ñandú",
      "Zeta",
    ]);
  });

  it("reads the sort from the query and defaults to relevance", () => {
    expect(termSort("name")).toBe("name");
    expect(termSort(undefined)).toBe("relevance");
    expect(termSort(["name", "name"])).toBe("relevance");
    expect(termSort("score")).toBe("relevance");
  });
});

describe("historyView and nextHistoryHref", () => {
  it("shows one page of 20 by default and links to the second", () => {
    const view = historyView({});
    expect(view).toEqual({ limit: 20, pages: 1, shown: 20 });
    expect(nextHistoryHref(view)).toBe("/app/history?pages=2");
  });

  it("keeps a valid limit in the next link and grows the shown items per page", () => {
    const view = historyView({ limit: "1", pages: "2" });
    expect(view).toEqual({ limit: 1, pages: 2, shown: 2 });
    expect(nextHistoryHref(view)).toBe("/app/history?pages=3&limit=1");
  });

  it("falls back to the defaults on a limit outside the contract or a bad page count", () => {
    expect(historyView({ limit: "0", pages: "x" })).toEqual({ limit: 20, pages: 1, shown: 20 });
    expect(historyView({ limit: "101", pages: "-3" })).toEqual({ limit: 20, pages: 1, shown: 20 });
    expect(historyView({ limit: ["5", "6"], pages: ["2"] })).toEqual({
      limit: 20,
      pages: 1,
      shown: 20,
    });
  });

  it("caps the shown items at 1000 and offers no link past them", () => {
    const view = historyView({ limit: "100", pages: "99" });
    expect(view).toEqual({ limit: 100, pages: 10, shown: 1000 });
    expect(nextHistoryHref(view)).toBeNull();
    expect(historyView({ limit: "30", pages: "40" })).toEqual({
      limit: 30,
      pages: 34,
      shown: 1000,
    });
  });
});

describe("bothLoaded", () => {
  it("is ok only when both reads are", () => {
    expect(
      bothLoaded([
        { kind: "ok", value: 1 },
        { kind: "ok", value: "a" },
      ]),
    ).toEqual({
      kind: "ok",
      value: [1, "a"],
    });
    expect(bothLoaded([{ kind: "ok", value: 1 }, { kind: "failed" }])).toEqual({ kind: "failed" });
  });
});

describe("formatting", () => {
  const iso = "2026-10-21T03:30:00.000Z";

  it("formats dates in the viewer's time zone, which can move the day", () => {
    expect(formatDate(iso, "es", "UTC")).toBe("21 oct 2026");
    expect(formatDate(iso, "en", "UTC")).toBe("Oct 21, 2026");
    expect(formatDate(iso, "es", "America/Mexico_City")).toBe("20 oct 2026");
  });

  it("adds the time for history entries", () => {
    expect(formatDateTime(iso, "en", "UTC")).toBe("Oct 21, 2026, 3:30 AM");
    expect(formatDateTime(iso, "es", "America/Mexico_City")).toBe("20 oct 2026, 21:30");
  });

  it("formats audio seconds with one decimal in the page's language", () => {
    expect(formatSeconds(12.25, "es")).toBe("12,3 s");
    expect(formatSeconds(4, "en")).toBe("4 s");
  });

  it("names the settings language in the page's language", () => {
    expect(languageName("es", "es")).toBe("Español");
    expect(languageName("en", "es")).toBe("Inglés");
    expect(languageName("es-MX", "en")).toBe("Spanish (Mexico)");
  });
});

describe("languageList", () => {
  it("names every dictation language in order, in the page's language", () => {
    expect(languageList(["es"], "en")).toBe("Spanish");
    expect(languageList(["es", "en"], "en")).toBe("Spanish and English");
    expect(languageList(["en", "es"], "es")).toBe("Inglés y español");
  });
});

describe("the user's context and usage", () => {
  it("lists the picks in the reader's language, then the detail, or says it is not set", () => {
    expect(
      contextText({ picks: ["law", "student"], detail: "contratos" }, dictionary("es").account),
    ).toBe("Derecho, Estudiante. contratos");
    expect(contextText({ picks: ["data-ai"], detail: "" }, dictionary("en").account)).toBe(
      "Data and AI",
    );
    expect(contextText({ picks: [], detail: "CRISPR" }, dictionary("en").account)).toBe("CRISPR");
    expect(contextText({ picks: [], detail: "" }, dictionary("es").account)).toBe("Sin indicar");
  });

  it("counts started minutes and never shows more than the cap", () => {
    const resetsAt = "2026-10-24T00:00:00.000Z";
    expect(usageMinutes({ usedSeconds: 61, capSeconds: 3600, resetsAt })).toEqual({
      used: "2",
      cap: "60",
    });
    expect(usageMinutes({ usedSeconds: 3725, capSeconds: 3600, resetsAt })).toEqual({
      used: "60",
      cap: "60",
    });
    expect(usageMinutes({ usedSeconds: 0, capSeconds: 1800, resetsAt })).toEqual({
      used: "0",
      cap: "30",
    });
  });
});
