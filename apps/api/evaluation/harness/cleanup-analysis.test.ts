import { describe, expect, it } from "vitest";
import {
  checkCleanup,
  cleanupRelativeGate,
  summarizeCleanup,
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
      invented: [],
      exact: true,
      meaningChanged: false,
      fillersLeft: [],
      punctuationIssues: [],
      termsWrong: [],
      styleIssues: [],
    });
  });

  it("flags words in neither the raw nor the expected text as invented content", () => {
    const checked = checkCleanup(
      result("Corre kubectl get pods en el namespace de staging y mándame los logs, por favor."),
      item,
    );
    expect(checked.flags).toEqual(["invented content"]);
    expect(checked.invented).toEqual(["por", "favor"]);
    expect(
      checkCleanup(result(expected), { ...item, raw: item.raw.replace("mándame", "mandame") })
        .invented,
    ).toEqual([]);
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
});
