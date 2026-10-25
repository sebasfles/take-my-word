import { describe, expect, it } from "vitest";
import { pcmToWav } from "../../e2e/speech.ts";
import type { TranscriptionCase } from "./fixtures.ts";
import {
  attribute,
  gapCounts,
  boundaryWindows,
  chooseDefault,
  comparePolicy,
  sliceWav,
  spansOf,
  type PolicyComparison,
  type SegmentedResult,
} from "./segmentation-analysis.ts";

const reference = "one two three four five six seven eight nine ten";

const item: TranscriptionCase = {
  id: "extended-en-1",
  kind: "speech",
  language: "en",
  dictionary: "developer",
  text: reference,
  variants: [],
  terms: ["seven"],
  mixed: false,
  endToEnd: false,
};

function result(
  arm: string,
  run: number,
  segments: string[],
  overrides: Partial<SegmentedResult> = {},
): SegmentedResult {
  return {
    id: `${arm}|${item.id}/Joanna|one|${String(run)}`,
    arm,
    candidate: arm,
    caseId: item.id,
    voice: "Joanna",
    mode: "one",
    run,
    connection: "reused",
    audioSeconds: 60,
    levelDbfs: -20,
    ok: true,
    text: segments.join(" "),
    language: "en",
    segments: segments.map((text, index) => ({
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
      text,
      termsTokens: 10,
      tailTokens: index === 0 ? 0 : 20,
      calls: 1,
    })),
    calls: [],
    coldStart: false,
    region: "us-east-1",
    memoryMb: 1024,
    listUsd: 0,
    chargedUsd: 0,
    at: "2026-10-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("spans and slices", () => {
  it("turns cuts into spans that end with the last one and keep unspoken spans apart", () => {
    expect(
      spansOf(
        [
          { atMs: 10_000, spoken: true, pause: true },
          { atMs: 20_000, spoken: false, pause: false },
        ],
        25_500,
      ),
    ).toEqual([
      { startMs: 0, endMs: 10_000, spoken: true, last: false },
      { startMs: 10_000, endMs: 20_000, spoken: false, last: false },
      { startMs: 20_000, endMs: 25_500, spoken: true, last: true },
    ]);
  });

  it("slices a 16 kHz WAV by milliseconds with a header that matches the slice", () => {
    const pcm = Buffer.alloc(32 * 3000);
    for (let index = 0; index < pcm.length / 2; index += 1)
      pcm.writeInt16LE(index % 3000, index * 2);
    const sliced = sliceWav(pcmToWav(pcm), 1000, 2500);
    expect(sliced.length).toBe(44 + 32 * 1500);
    expect(sliced.readUInt32LE(40)).toBe(32 * 1500);
    expect(sliced.readUInt32LE(4)).toBe(36 + 32 * 1500);
    expect(sliced.readInt16LE(44)).toBe(16_000 % 3000);
  });
});

describe("boundary attribution", () => {
  it("counts an error next to a cut inside the window and an error far from it outside", () => {
    const segments = ["one two three four", "fave six seven eight nine tin"];
    const windows = boundaryWindows(reference, segments);
    expect([...windows].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    const counted = attribute(reference, segments.join(" "), windows);
    expect(counted).toEqual({ words: 10, errors: 2, windowWords: 4, windowErrors: 1 });
  });

  it("counts a word repeated across a cut as a boundary insertion", () => {
    const segments = ["one two three four five", "five six seven eight nine ten"];
    const windows = boundaryWindows(reference, segments);
    const counted = attribute(reference, segments.join(" "), windows);
    expect(counted.errors).toBe(1);
    expect(counted.windowErrors).toBe(1);
  });

  it("has no window for a single segment", () => {
    expect(boundaryWindows(reference, [reference]).size).toBe(0);
  });
});

describe("the gate", () => {
  const items = new Map([[item.id, item]]);
  const wholes = [1, 2, 3].map((run) =>
    result("whole", run, [run === 2 ? reference.replace("two", "too") : reference]),
  );

  it("passes a policy whose errors sit only at the cuts", () => {
    const segmented = [1, 2, 3].map((run) =>
      result("10/20", run, ["one two three four five", "five six seven eight nine ten"]),
    );
    const comparison = comparePolicy("10/20", [...wholes, ...segmented], items, []);
    expect(comparison.reasons.filter((reason) => reason.startsWith("one:"))).toEqual([]);
    expect(comparison.modes.one.segmented.windowErrors).toBe(3);
  });

  it("fails a policy that loses a term or adds errors away from the cuts", () => {
    const segmented = [1, 2, 3].map((run) =>
      result("10/20", run, ["one too thee four five", "six seben eight nine ten"]),
    );
    const comparison = comparePolicy("10/20", [...wholes, ...segmented], items, []);
    expect(comparison.passed).toBe(false);
    expect(comparison.reasons.join("; ")).toMatch(/one: WER away from the cuts/);
    expect(comparison.reasons.join("; ")).toMatch(/one: term errors/);
  });

  it("fails a policy with more failed takes than the whole take", () => {
    const segmented = [1, 2, 3].map((run) => result("10/20", run, [reference], { ok: run !== 3 }));
    const comparison = comparePolicy("10/20", [...wholes, ...segmented], items, []);
    expect(comparison.reasons.join("; ")).toMatch(/one: 1 failed takes/);
  });
});

describe("the default", () => {
  const comparison = (policy: string, wer: number, passed: boolean): PolicyComparison => {
    const summary = {
      results: 1,
      failed: 0,
      wer,
      werPerRun: [wer - 0.01, wer + 0.01],
      outsideWer: wer,
      outsideWerPerRun: [wer],
      windowErrors: 0,
      windowWords: 0,
      termErrorRate: 0,
      termErrorsPerRun: [0],
      flags: 0,
      segments: 1,
      pauseCuts: 0,
      forcedCuts: 0,
      skippedSpans: 0,
      termsTokens: 0,
      tailTokensMean: 0,
      tailTokensMax: 0,
    };
    const modes = {
      one: { segmented: summary, whole: summary },
      both: { segmented: summary, whole: summary },
    };
    return { policy, modes, passed, reasons: passed ? [] : ["worse"] };
  };

  it("prefers the shorter minimum when both pass within the whole take's spread", () => {
    expect(chooseDefault([comparison("20/30", 0.05, true), comparison("10/20", 0.055, true)])).toBe(
      "10/20",
    );
  });

  it("picks the clearly better passing policy and none when neither passes", () => {
    expect(chooseDefault([comparison("20/30", 0.05, true), comparison("10/20", 0.09, true)])).toBe(
      "20/30",
    );
    expect(chooseDefault([comparison("10/20", 0.05, false)])).toBeUndefined();
  });
});

describe("pauses", () => {
  it("counts each clip's gaps once although every policy repeats them", () => {
    const policy = { enabled: true, minSeconds: 10, maxSeconds: 20, pauseMs: 600 };
    const clip = { id: "a/Joanna", audioMs: 60_000, cuts: [], gapsMs: [350, 450, 650, 900] };
    const counted = gapCounts([
      { ...clip, policy },
      { ...clip, policy: { ...policy, minSeconds: 20, maxSeconds: 30 } },
      { id: "b/Matthew", policy, audioMs: 30_000, cuts: [], gapsMs: [820] },
    ]);
    expect(counted).toEqual({ clips: 2, minutes: 1.5, atLeast: { 400: 4, 600: 3, 800: 2 } });
  });
});
