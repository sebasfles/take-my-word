import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkCleanup } from "./cleanup-analysis.ts";
import { chainedChecksPath, chainedChecksSchema, loadCleanupFixtures } from "./cleanup-fixtures.ts";
import { loadTranscriptionFixtures } from "./fixtures.ts";
import { hasTerm, languageIssue } from "./metrics.ts";

const transcription = loadTranscriptionFixtures();
const cleanup = loadCleanupFixtures(transcription);

describe("committed fixtures", () => {
  it("never fail the language gate with their own expected texts", () => {
    const expected = [
      ...transcription.cases.flatMap((item) =>
        item.kind === "speech"
          ? [item.text, ...item.variants].map((text) => ({
              id: item.id,
              text,
              language: item.language,
            }))
          : [],
      ),
      ...cleanup.cases.flatMap((item) =>
        item.expected.map((text) => ({ id: item.id, text, language: item.language })),
      ),
    ];
    expect(
      expected
        .map((entry) => ({ ...entry, issue: languageIssue(entry.text, entry.language) }))
        .filter((entry) => entry.issue !== undefined),
    ).toEqual([]);
  });

  it("give every speech case chained checks that its own expected texts pass", () => {
    const checks = chainedChecksSchema.parse(JSON.parse(readFileSync(chainedChecksPath, "utf8")));
    const problems = transcription.cases.flatMap((item) => {
      if (item.kind !== "speech") return [];
      const written = checks[item.id];
      if (written === undefined) return [`${item.id}: no checks`];
      return [item.text, ...item.variants].flatMap((text) => [
        ...written.required
          .filter((word) => !hasTerm(text, word))
          .map((word) => `${item.id}: expected text lacks "${word}"`),
        ...written.forbidden
          .filter((word) => hasTerm(text, word))
          .map((word) => `${item.id}: expected text has "${word}"`),
      ]);
    });
    expect(problems).toEqual([]);
  });

  it("pass every cleanup case's own checks with each of its expected texts", () => {
    const problems = cleanup.cases.flatMap((item) =>
      item.expected.flatMap((text) => {
        const checked = checkCleanup(
          {
            id: `expected|${item.id}|one|1`,
            candidate: "expected",
            caseId: item.id,
            run: 1,
            connection: "fresh",
            ok: true,
            text,
            calls: [],
            coldStart: false,
            region: "",
            memoryMb: 0,
            listUsd: 0,
            chargedUsd: 0,
            at: "",
          },
          item,
        );
        return [
          ...checked.flags,
          ...checked.missingRequired.map((word) => `lacks "${word}"`),
          ...checked.presentForbidden.map((word) => `has "${word}"`),
          ...checked.termsWrong.map((term) => `term "${term}"`),
        ].map((problem) => `${item.id}: ${problem}`);
      }),
    );
    expect(problems).toEqual([]);
  });

  it("keep every chained check free of its case's own terms", () => {
    const checks = chainedChecksSchema.parse(JSON.parse(readFileSync(chainedChecksPath, "utf8")));
    const overlaps = transcription.cases.flatMap((item) => {
      const written = item.kind === "speech" ? checks[item.id] : undefined;
      if (item.kind !== "speech" || written === undefined) return [];
      return [...written.required, ...written.forbidden].flatMap((word) =>
        item.terms
          .filter((term) => hasTerm(word, term))
          .map((term) => `${item.id}: "${word}" has "${term}"`),
      );
    });
    expect(overlaps).toEqual([]);
  });
});
