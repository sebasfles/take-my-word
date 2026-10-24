import { createHash } from "node:crypto";
import type { ChainedChecks, CleanupCase } from "./cleanup-fixtures.ts";
import { voicesFor, type TranscriptionFixtures } from "./fixtures.ts";
import { check, type TranscriptionResult } from "./transcription-analysis.ts";

export function chainedCases(
  fixtures: TranscriptionFixtures,
  results: readonly TranscriptionResult[],
  transcribers: readonly string[],
  checks: ChainedChecks,
): CleanupCase[] {
  const cases = new Map<string, CleanupCase>();
  for (const item of fixtures.cases) {
    if (item.kind !== "speech") continue;
    const [voice] = voicesFor(fixtures, item);
    for (const transcriber of transcribers) {
      const result = results.find(
        (candidate) =>
          candidate.candidate === transcriber &&
          candidate.caseId === item.id &&
          candidate.voice === voice &&
          candidate.mode === "one" &&
          candidate.run === 1,
      );
      if (result === undefined) {
        throw new Error(`no run-1 result of ${transcriber} for ${item.id}/${String(voice)}`);
      }
      const raw = (result.text ?? "").trim();
      if (!check(result, item).pasted || raw === "") continue;
      const key = `${item.id}\t${raw}`;
      const existing = cases.get(key);
      if (existing?.chain) {
        existing.chain.transcribers.push(transcriber);
        continue;
      }
      const written = checks[item.id];
      if (written === undefined) throw new Error(`no hand-written checks for ${item.id}`);
      const digest = createHash("sha256").update(raw).digest("hex").slice(0, 8);
      cases.set(key, {
        id: `chained-${item.id}-${digest}`,
        language: item.language,
        style: "plain",
        dictionary: item.dictionary,
        source: `suite 1 run 1, ${item.id}/${String(voice)}, one language`,
        raw,
        expected: [item.text, ...item.variants],
        required: written.required,
        forbidden: written.forbidden,
        terms: item.terms,
        fillers: [],
        styleRequired: [],
        styleForbidden: [],
        allowed: written.allowed,
        chain: { caseId: item.id, transcribers: [transcriber] },
      });
    }
  }
  return [...cases.values()];
}
