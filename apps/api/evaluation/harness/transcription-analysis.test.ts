import { describe, expect, it } from "vitest";
import type { SpeechCase, TranscriptionCase } from "./fixtures.ts";
import {
  check,
  relativeGate,
  summarize,
  type TranscriptionResult,
} from "./transcription-analysis.ts";

const speech: SpeechCase = {
  id: "dev-es-4",
  kind: "speech",
  language: "es",
  dictionary: "developer",
  text: "Haz rebase sobre main, sube el hotfix y avísame cuando el build esté en verde.",
  variants: [],
  terms: ["rebase", "hotfix", "build"],
  mixed: false,
  endToEnd: false,
};

const noise: TranscriptionCase = {
  id: "noise-room-es",
  kind: "noise",
  language: "es",
  dictionary: "developer",
  color: "brown",
  levelDbfs: -45,
  seconds: 4,
  seed: 2,
};

function result(overrides: Partial<TranscriptionResult>): TranscriptionResult {
  return {
    id: "x",
    candidate: "candidate",
    caseId: "dev-es-4",
    voice: "Lupe",
    mode: "one",
    run: 1,
    connection: "reused",
    audioSeconds: 5,
    levelDbfs: -18,
    ok: true,
    text: speech.text,
    language: "es",
    calls: [{ ms: 300, newConnections: 0, headers: {} }],
    coldStart: false,
    region: "us-east-1",
    memoryMb: 1024,
    listUsd: 0,
    chargedUsd: 0,
    at: "2026-10-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("check", () => {
  it("passes an exact transcript", () => {
    expect(check(result({}), speech)).toMatchObject({
      errors: 0,
      missed: [],
      flags: [],
      pasted: true,
    });
  });

  it("flags invented content and a known hallucination appended to speech", () => {
    const checked = check(result({ text: `${speech.text} Gracias por ver el video.` }), speech);
    expect(checked.flags).toEqual(["invented content", "hallucination"]);
  });

  it("flags a translated transcript as wrong language", () => {
    const checked = check(
      result({ text: "Rebase on main, push the hotfix and tell me when the build is green." }),
      speech,
    );
    expect(checked.flags).toContain("wrong language");
  });

  it("flags a transcript in another script or a third language, with what it read", () => {
    const cyrillic = check(result({ text: "Хаз ребейс собре мейн." }), speech);
    expect(cyrillic.flags).toEqual(["wrong language"]);
    expect(cyrillic.detail).toEqual(["non-Latin script (Хазре)"]);
    const portuguese = check(
      result({
        text: "Faz rebase em main, sobe o hotfix e me avisa quando o build estiver em verde, não é?",
      }),
      speech,
    );
    expect(portuguese.flags).toContain("wrong language");
    expect(portuguese.detail).toContain("reads as neither es nor en");
  });

  it("counts missed domain terms and a language flip", () => {
    const checked = check(
      result({
        mode: "both",
        language: "en",
        text: "Haz ribeis sobre main, sube el hot fix y avísame cuando el build esté en verde.",
      }),
      speech,
    );
    expect(checked.missed).toEqual(["rebase", "hotfix"]);
    expect(checked.flipped).toBe(true);
  });

  it("flags text on noise only when it survives production's level and phrase guards", () => {
    const on = (text: string, levelDbfs: number) =>
      check(result({ caseId: noise.id, text, levelDbfs }), noise).flags;
    expect(on("Gracias.", -45)).toEqual([]);
    expect(on("Gracias por ver el video.", -45)).toEqual([]);
    expect(on("Thanks for watching!", -60)).toEqual([]);
    expect(on("Suscríbete y dale like.", -45)).toEqual(["hallucination"]);
    expect(on("Gracias.", -30)).toEqual(["hallucination"]);
  });

  it("scores dropped speech as the empty text production pastes", () => {
    const quiet: SpeechCase = {
      ...speech,
      id: "quiet-es-1",
      text: "Gracias, ya revisé el informe y está todo bien.",
      terms: ["informe"],
    };
    const checked = check(result({ caseId: quiet.id, text: "Gracias.", levelDbfs: -46 }), quiet);
    expect(checked.pasted).toBe(false);
    expect(checked).toMatchObject({ errors: 9, words: 9, missed: ["informe"], flags: [] });
  });

  it("leaves failed calls out of accuracy", () => {
    const failed = result({ ok: false, error: { status: 500, message: "x" } });
    delete failed.text;
    expect(check(failed, speech)).toMatchObject({
      errors: 0,
      words: 0,
      missed: [],
      terms: 0,
      flags: [],
    });
  });
});

describe("relativeGate", () => {
  const runsOf = (candidate: string, texts: string[]) =>
    texts.map((text, index) =>
      check(result({ candidate, run: index + 1, text, mode: "one" }), speech),
    );
  const exact = speech.text;
  const oneError = exact.replace("verde", "verdad");
  const twoErrors = oneError.replace("sube", "suba");
  const longIds = new Set<string>();

  it("passes a candidate within the baseline's run-to-run spread and fails one beyond it", () => {
    const checked = [
      ...runsOf("baseline", [exact, oneError, exact]),
      ...runsOf("same", [oneError, oneError, exact]),
      ...runsOf("worse", [twoErrors, twoErrors, twoErrors]),
    ];
    const baseline = summarize("baseline", checked, [], longIds);
    expect(relativeGate(summarize("same", checked, [], longIds), baseline).passed).toBe(true);
    const worse = relativeGate(summarize("worse", checked, [], longIds), baseline);
    expect(worse.passed).toBe(false);
    expect(worse.reasons[0]).toMatch(/^one: WER/);
  });

  it("leaves raw domain-term errors to the gate after cleanup", () => {
    const termError = exact.replace("build", "bild");
    const checked = [
      ...runsOf("baseline", [oneError, oneError, oneError]),
      ...runsOf("unprompted", [termError, termError, termError]),
    ];
    const baseline = summarize("baseline", checked, [], longIds);
    const unprompted = summarize("unprompted", checked, [], longIds);
    expect(unprompted.modes.one.wer).toBe(baseline.modes.one.wer);
    expect(unprompted.modes.one.termErrorRate).toBeGreaterThan(baseline.modes.one.termErrorRate);
    expect(relativeGate(unprompted, baseline)).toEqual({ passed: true, reasons: [] });
  });

  it("counts provider failures, not the harness's own failed calls to the eval Lambda", () => {
    const checked = runsOf("candidate", [exact, exact, exact]);
    const failures = [
      {
        id: "candidate|dev-es-4/Lupe|one|1",
        message: "groq-whisper:whisper-large-v3-turbo request failed: TimeoutError",
      },
      {
        id: "candidate|dev-es-4/Lupe|one|2",
        message: "Signature expired: 20261024T123841Z is now earlier than 20261024T124959Z",
      },
    ];
    expect(summarize("candidate", checked, failures, longIds).modes.one).toMatchObject({
      failedAttempts: 1,
      attempts: 4,
    });
  });

  it("fails a candidate whose calls fail more often than the baseline's plus its spread", () => {
    const checked = [
      ...runsOf("baseline", [exact, exact, exact]),
      ...runsOf("flaky", [exact, exact, exact]),
    ];
    const failures = [
      { id: "flaky|dev-es-4/Lupe|one|1", status: 500 },
      { id: "flaky|dev-es-4/Lupe|one|2", status: 502 },
      { id: "flaky|dev-es-4/Lupe|one|3", status: 500 },
      { id: "flaky|dev-es-4/Lupe|one|3", status: 429 },
    ];
    const baseline = summarize("baseline", checked, failures, longIds);
    const flaky = summarize("flaky", checked, failures, longIds);
    expect(flaky.modes.one).toMatchObject({ failedAttempts: 3, attempts: 6, rateLimited: 1 });
    const gate = relativeGate(flaky, baseline);
    expect(gate.passed).toBe(false);
    expect(gate.reasons).toEqual([expect.stringMatching(/^one: failed calls 50\.0%/)]);
    expect(relativeGate(summarize("flaky", checked, [], longIds), baseline).passed).toBe(true);
  });
});
