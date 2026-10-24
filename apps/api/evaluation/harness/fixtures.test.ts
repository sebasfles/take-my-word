import { describe, expect, it } from "vitest";
import { loadCleanupFixtures } from "./cleanup-fixtures.ts";
import { loadTranscriptionFixtures } from "./fixtures.ts";
import { languageIssue } from "./metrics.ts";

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
});
