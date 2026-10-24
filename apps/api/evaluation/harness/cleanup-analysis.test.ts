import { describe, expect, it } from "vitest";
import {
  checkCleanup,
  cleanupGate,
  cleanupRelativeGate,
  combinationCleanupGate,
  summarizeCleanup,
  summarizeCleanupBuckets,
  type CleanupResult,
} from "./cleanup-analysis.ts";
import type { CleanupCase } from "./cleanup-fixtures.ts";

const item: CleanupCase = {
  id: "dev-es-2-casual",
  language: "es",
  style: "casual",
  dictionary: "developer",
  source: "test",
  raw: "eh corre cube control get pots en el name space de staging y mándame los logos",
  expected: ["Corre kubectl get pods en el namespace de staging y mándame los logs."],
  required: ["corre", "mándame"],
  forbidden: ["borra"],
  terms: ["kubectl", "pods", "namespace", "logs"],
  fillers: ["eh"],
  styleRequired: ["mándame"],
  styleForbidden: ["mándeme", "usted"],
  allowed: [],
};

function result(text: string, overrides: Partial<CleanupResult> = {}): CleanupResult {
  return {
    id: "x|dev-es-2-casual|one|1",
    candidate: "x",
    caseId: item.id,
    run: 1,
    connection: "reused",
    ok: true,
    text,
    usage: { inputTokens: 400, outputTokens: 30 },
    calls: [{ ms: 500, newConnections: 0, headers: {} }],
    coldStart: false,
    region: "us-east-1",
    memoryMb: 1024,
    listUsd: 0.0001,
    chargedUsd: 0.0001,
    at: "2026-10-23T12:00:00.000Z",
    ...overrides,
  };
}

const [expected = ""] = item.expected;

describe("checkCleanup", () => {
  it("passes the expected text on every check", () => {
    expect(checkCleanup(result(expected), item)).toMatchObject({
      flags: [],
      newWords: [],
      exact: true,
      meaningChanged: false,
      fillersLeft: [],
      punctuationIssues: [],
      termsWrong: [],
      styleIssues: [],
    });
  });

  it("counts single new words without failing the hard gate", () => {
    const checked = checkCleanup(
      result("Corre kubectl get pods en el namespace de staging y mándame los logs, por favor."),
      item,
    );
    expect(checked.flags).toEqual([]);
    expect(checked.newWords).toEqual(["por", "favor"]);
    expect(checked.longestNewRun).toBe(2);
    expect(
      checkCleanup(result(expected), { ...item, raw: item.raw.replace("mándame", "mandame") })
        .newWords,
    ).toEqual([]);
  });

  it("fails the hard gate on 3 or more new words in a row, as in transcription", () => {
    const checked = checkCleanup(
      result(
        "Corre kubectl get pods en el namespace de staging y mándame los logs. Avísame cuando termines.",
      ),
      item,
    );
    expect(checked.flags).toEqual(["invented content"]);
    expect(checked.longestNewRun).toBe(3);
  });

  it("flags a translation as wrong language", () => {
    const checked = checkCleanup(
      result("Run kubectl get pods in the staging namespace and send me the logs."),
      { ...item, allowed: ["run", "in", "the", "and", "send", "me"] },
    );
    expect(checked.flags).toEqual(["wrong language"]);
  });

  it("finds a changed verb, a filler left, a term not as written, punctuation and style", () => {
    const checked = checkCleanup(
      result("eh borra Kubectl get pods en el namespace de staging y mándeme los logs"),
      { ...item, allowed: ["borra", "mándeme"] },
    );
    expect(checked).toMatchObject({
      newWords: [],
      missingRequired: ["corre", "mándame"],
      presentForbidden: ["borra"],
      meaningChanged: true,
      fillersLeft: ["eh"],
      termsWrong: ["kubectl"],
      punctuationIssues: ["starts in lowercase", "no closing punctuation"],
      styleIssues: ['missing "mándame"', 'has "mándeme"'],
    });
  });

  it("asks a Spanish question for its opening mark", () => {
    const question: CleanupCase = {
      ...item,
      expected: ["¿Lo puedes revisar?"],
      raw: "lo puedes revisar",
    };
    expect(checkCleanup(result("Lo puedes revisar?"), question).punctuationIssues).toEqual([
      "question without ¿",
    ]);
    expect(checkCleanup(result("Lo puedes revisar."), question).punctuationIssues).toEqual([
      "question lost its question mark",
    ]);
  });
});

describe("cleanup gates", () => {
  const changed = "Corre kubectl get pods en el namespace de staging y borra los logs.";
  const runsOf = (candidate: string, texts: string[]) =>
    texts.map((text, index) =>
      checkCleanup(
        result(text, {
          candidate,
          run: index + 1,
          id: `${candidate}|${item.id}|one|${String(index + 1)}`,
        }),
        { ...item, allowed: ["borra"] },
      ),
    );

  it("fails meaning changes above the baseline's plus its spread and counts the flags", () => {
    const checked = [
      ...runsOf("baseline", [expected, expected, expected]),
      ...runsOf("careless", [changed, changed, expected]),
    ];
    const baseline = summarizeCleanup("baseline", checked, []);
    const careless = summarizeCleanup("careless", checked, []);
    expect(careless.meaningChangeRate).toBeCloseTo(2 / 3);
    const gate = cleanupRelativeGate(careless, baseline);
    expect(gate.passed).toBe(false);
    expect(gate.reasons[0]).toMatch(/^meaning changes 66\.7%/);
    expect(cleanupRelativeGate(baseline, baseline).passed).toBe(true);
    expect(baseline.fillerRemovalRate).toBe(1);
    expect(baseline.styleRate).toBe(1);
  });

  it("fails outputs with new words more often than the baseline plus its spread", () => {
    const polite =
      "Corre kubectl get pods en el namespace de staging y mándame los logs, por favor.";
    const checked = [
      ...runsOf("baseline", [expected, expected, expected]),
      ...runsOf("chatty", [polite, polite, expected]),
    ];
    const chatty = summarizeCleanup("chatty", checked, []);
    expect(chatty.newWordRate).toBeCloseTo(2 / 3);
    expect(chatty.flags["invented content"]).toBe(0);
    const gate = cleanupRelativeGate(chatty, summarizeCleanup("baseline", checked, []));
    expect(gate.reasons).toEqual([expect.stringMatching(/^outputs with new words 66\.7%/)]);
  });
});

describe("cleanup buckets", () => {
  const changed = "Corre kubectl get pods en el namespace de staging y borra los logs.";
  const chainedFrom = (caseId: string, transcribers: string[]): CleanupCase => ({
    ...item,
    id: `chained-${caseId}`,
    allowed: ["borra"],
    chain: { caseId, transcribers },
  });
  const round1 = { ...item, allowed: ["borra"] };
  const longCase = chainedFrom("extended-es-45", ["turbo"]);
  const parakeetCase = chainedFrom("dev-es-2", ["parakeet"]);
  const run = (candidate: string, target: CleanupCase, texts: string[]) =>
    texts.map((text, index) =>
      checkCleanup(
        result(text, {
          candidate,
          caseId: target.id,
          run: index + 1,
          id: `${candidate}|${target.id}|one|${String(index + 1)}`,
        }),
        target,
      ),
    );
  const isExtended = (caseId: string) => caseId.startsWith("extended-");

  it("fails a refiner whose long cases alone change meaning, though round 1's cases pass", () => {
    const checked = [
      ...run("baseline", round1, [expected, expected, expected]),
      ...run("baseline", longCase, [expected, expected, expected]),
      ...run("candidate", round1, [expected, expected, expected]),
      ...run("candidate", longCase, [changed, changed, changed]),
    ];
    const buckets = summarizeCleanupBuckets(["baseline", "candidate"], checked, [], isExtended);
    expect(buckets.round1.get("candidate")?.meaningChangeRate).toBe(0);
    const gate = cleanupGate("candidate", "baseline", buckets, "30 to 120 s");
    expect(gate?.hard).toBe(true);
    expect(gate?.relative.reasons).toEqual([
      expect.stringMatching(/^30 to 120 s, meaning changes 100\.0%/),
    ]);
    expect(cleanupGate("baseline", "baseline", buckets, "30 to 120 s")?.relative.passed).toBe(true);
  });

  it("reports filler removal and style as not measured where a bucket has neither", () => {
    const plainCase = { ...longCase, fillers: [], styleRequired: [], styleForbidden: [] };
    const checked = run("candidate", plainCase, [expected, expected, expected]);
    const buckets = summarizeCleanupBuckets(["candidate"], checked, [], isExtended);
    expect(buckets.extended.get("candidate")).toMatchObject({
      fillerRemovalRate: undefined,
      styleRate: undefined,
      punctuationRate: 1,
    });
  });

  it("judges a combination on its own transcriber's raws against today's pair", () => {
    const checked = [
      ...run("baseline", longCase, [expected, expected, expected]),
      ...run("candidate", longCase, [expected, expected, expected]),
      ...run("candidate", parakeetCase, [changed, expected, expected]),
    ];
    const buckets = summarizeCleanupBuckets(["baseline", "candidate"], checked, [], isExtended);
    const today = buckets.chainedBy("turbo").get("baseline");
    const onParakeet = buckets.chainedBy("parakeet").get("candidate");
    const onTurbo = buckets.chainedBy("turbo").get("candidate");
    if (today === undefined || onParakeet === undefined || onTurbo === undefined) {
      throw new Error("missing bucket");
    }
    expect(onParakeet.results).toBe(3);
    expect(combinationCleanupGate(onParakeet, today).reasons).toEqual([
      expect.stringMatching(/^meaning changes 33\.3% on its transcriber's raws/),
    ]);
    expect(combinationCleanupGate(onTurbo, today).passed).toBe(true);
  });
});
