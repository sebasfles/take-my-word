import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  dictationResponseSchema,
  type DictationResponse,
  type Language,
} from "@take-my-word/shared";
import { loadWorkspaceEnv, requiredEnv } from "../scripts/sign-in.ts";
import {
  buildClip,
  loadTranscriptionFixtures,
  transcriptionFixturesPath,
  voicesFor,
  type Clip,
  type SpeechCase,
} from "./harness/fixtures.ts";
import {
  bestWordErrors,
  dominantLanguage,
  hallucinatedPhrases,
  inventedRunThreshold,
  missedTerms,
  percentile,
} from "./harness/metrics.ts";
import { Pacer, type LedgerEntry } from "./harness/pacing.ts";
import { billedAudioSeconds, modelFacts } from "./harness/prices.ts";
import { appendJsonl, readJsonl } from "./harness/store.ts";
import { describeOverrides, overridesFrom, pacingKeyOf, pacingKeys } from "./harness/suite.ts";
import { createThrowawayUser } from "./harness/throwaway-user.ts";
import { defaultGroqWhisperModel } from "../src/dictation/providers/groq-whisper.ts";
import {
  evaluationCodePaths,
  fromInvocation,
  fromRoot,
  lastCommitTouching,
  measuredRegion,
  openWorkspace,
  requireCommittedFixtures,
  sha256,
} from "./harness/workspace.ts";

const { values } = parseArgs({
  options: {
    results: { type: "string" },
    report: { type: "string" },
    runs: { type: "string", default: "5" },
    burst: { type: "string", default: "3" },
    "whisper-daily-kept": { type: "string" },
  },
});
if (values.results === undefined || values.report === undefined) {
  console.error("usage: pnpm eval:e2e --results <dir> --report <report.md> [--runs 5] [--burst 3]");
  process.exit(2);
}
const resultsDir = fromInvocation(values.results);
const reportPath = fromInvocation(values.report);
const runs = Number(values.runs);
const burst = Number(values.burst);

const workspace = openWorkspace();
loadWorkspaceEnv();
const api = requiredEnv("API_URL");
if (!new URL(api).hostname.startsWith("api.dev.")) {
  throw new Error(`the end-to-end suite runs against dev only; API_URL is ${api}`);
}
const fixtures = loadTranscriptionFixtures();
requireCommittedFixtures(transcriptionFixturesPath, evaluationCodePaths);
const codeCommit = lastCommitTouching(evaluationCodePaths);
const cases = fixtures.cases.filter(
  (item): item is SpeechCase => item.kind === "speech" && item.endToEnd,
);

interface Sent {
  caseId: string;
  phase: "burst" | "warm";
  run: number;
  sentAt: number;
  receivedAt: number;
  clientMs: number;
  status: number;
  response?: DictationResponse;
  cold?: { initMs: number };
}

async function dictate(token: string, clip: Clip): Promise<Omit<Sent, "caseId" | "phase" | "run">> {
  const form = new FormData();
  form.append("meta", JSON.stringify({}));
  form.append("audio", new Blob([new Uint8Array(clip.audio)], { type: "audio/wav" }), "clip.wav");
  const sentAt = Date.now();
  const start = performance.now();
  const response = await fetch(`${api}/dictations`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const body: unknown = await response.json();
  const clientMs = performance.now() - start;
  return {
    sentAt,
    receivedAt: Date.now(),
    clientMs,
    status: response.status,
    ...(response.ok && { response: dictationResponseSchema.parse(body) }),
  };
}

async function call(token: string, method: string, path: string, body: unknown): Promise<void> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`${method} ${path} answered ${String(response.status)}`);
}

async function settingsWith(token: string, languages: Language[]): Promise<void> {
  const current: unknown = await (
    await fetch(`${api}/me/settings`, { headers: { authorization: `Bearer ${token}` } })
  ).json();
  await call(token, "PUT", "/me/settings", {
    ...(current as Record<string, unknown>),
    dictationLanguages: languages,
  });
}

interface Report {
  at: number;
  durationMs: number;
  initMs?: number;
}

async function reports(group: string, from: number, to: number): Promise<Report[]> {
  const logs = new CloudWatchLogsClient({ region: measuredRegion });
  const found: Report[] = [];
  let nextToken: string | undefined;
  do {
    const page = await logs.send(
      new FilterLogEventsCommand({
        logGroupName: group,
        startTime: from,
        endTime: to,
        filterPattern: "REPORT",
        nextToken,
      }),
    );
    for (const event of page.events ?? []) {
      const message = event.message ?? "";
      const duration = /\tDuration: ([\d.]+) ms/.exec(message)?.[1];
      const init = /Init Duration: ([\d.]+) ms/.exec(message)?.[1];
      if (duration === undefined) continue;
      found.push({
        at: event.timestamp ?? 0,
        durationMs: Number(duration),
        ...(init !== undefined && { initMs: Number(init) }),
      });
    }
    nextToken = page.nextToken;
  } while (nextToken !== undefined);
  return found;
}

function markCold(sent: Sent[], cold: Report[]): void {
  for (const report of cold) {
    const overlapping = sent.filter(
      (entry) =>
        entry.cold === undefined &&
        report.at >= entry.sentAt - 1_000 &&
        report.at <= entry.receivedAt + 1_000,
    );
    const closest = overlapping.sort(
      (a, b) =>
        Math.abs((a.response?.latencyMs.total ?? 0) - report.durationMs) -
        Math.abs((b.response?.latencyMs.total ?? 0) - report.durationMs),
    )[0];
    if (closest !== undefined && report.initMs !== undefined)
      closest.cold = { initMs: report.initMs };
  }
}

const ms = (value: number | undefined) =>
  value === undefined ? "n/a" : `${String(Math.round(value))} ms`;
const stats = (values: number[]) =>
  values.length === 0
    ? "n/a"
    : `${ms(percentile(values, 50))} / ${ms(percentile(values, 95))} (${String(values.length)})`;

function report(
  sent: Sent[],
  dictateCold: Report[],
  authorizerCold: Report[],
  startedAt: string,
): string {
  const lines: string[] = [];
  const push = (...more: string[]) => lines.push(...more);
  push("# End-to-end guard", "");
  push(
    `Run ${startedAt} against the dev API with the production pipeline as deployed there, from code commit \`${codeCommit}\` and fixtures sha256 \`${sha256(transcriptionFixturesPath).slice(0, 16)}\`.`,
    `A throwaway user with the fixture's developer dictionary dictated each case under its own language; ${String(burst)} concurrent requests opened the run to catch cold starts, then ${String(runs)} sequential runs per case, paced to half of the production transcriber's free-plan limits.`,
    "Release to text is measured on the client that sent the request, so it includes that client's network to us-east-1.",
    ...describeOverrides(overrides).map((note) => `Override for this run: ${note}.`),
    `Reproduce from the repository root: \`pnpm --filter @take-my-word/api eval:e2e --results ${fromRoot(resultsDir)} --report ${fromRoot(reportPath)} --runs ${String(runs)} --burst ${String(burst)}${overrides.whisperDailyKept === undefined ? "" : ` --whisper-daily-kept ${String(overrides.whisperDailyKept)}`}\`.`,
    "",
  );
  const ok = sent.filter((entry) => entry.response !== undefined);
  const warm = ok.filter((entry) => entry.cold === undefined);
  const cold = ok.filter((entry) => entry.cold !== undefined);
  push("## Latency", "");
  push("| Measure | P50 / P95 (samples) |", "|---|---|");
  push(`| Release to text, warm Lambda | ${stats(warm.map((entry) => entry.clientMs))} |`);
  push(`| Release to text, cold Lambda | ${stats(cold.map((entry) => entry.clientMs))} |`);
  push(
    `| Server total, warm | ${stats(warm.map((entry) => entry.response?.latencyMs.total ?? 0))} |`,
  );
  push(
    `| Transcribe, warm | ${stats(warm.map((entry) => entry.response?.latencyMs.transcribe ?? 0))} |`,
  );
  push(`| Refine, warm | ${stats(warm.map((entry) => entry.response?.latencyMs.refine ?? 0))} |`);
  push(`| dictate init duration | ${stats(dictateCold.map((entry) => entry.initMs ?? 0))} |`);
  push(`| authorizer init duration | ${stats(authorizerCold.map((entry) => entry.initMs ?? 0))} |`);
  push("", `Failed requests: ${String(sent.length - ok.length)} of ${String(sent.length)}.`, "");
  push("## Every dictation", "");
  for (const item of cases) {
    push(`### ${item.id}`, "", `Expected: ${item.text}`, "");
    for (const entry of sent.filter((candidate) => candidate.caseId === item.id)) {
      const response = entry.response;
      if (response === undefined) {
        push(`- ${entry.phase} ${String(entry.run)}: failed with ${String(entry.status)}`);
        continue;
      }
      const references = [item.text, ...item.variants];
      const raw = bestWordErrors(references, response.raw);
      const flags = [
        ...(bestWordErrors(references, response.text).longestInsertionRun >= inventedRunThreshold
          ? ["invented content"]
          : []),
        ...hallucinatedPhrases(response.text, references).map(
          (phrase) => `hallucination "${phrase}"`,
        ),
        ...(dominantLanguage(response.text) !== undefined &&
        dominantLanguage(response.text) !== item.language
          ? ["wrong language"]
          : []),
      ];
      push(
        `- ${entry.phase} ${String(entry.run)}${entry.cold ? `, cold (init ${ms(entry.cold.initMs)})` : ""}: ${ms(entry.clientMs)} release to text, raw WER ${String(raw.errors)}/${String(raw.words)}, missed raw [${missedTerms(response.raw, item.terms).join(", ")}], text [${missedTerms(response.text, item.terms).join(", ")}]${flags.length > 0 ? `, **${flags.join(", ")}**` : ""}`,
        `  - raw: ${response.raw}`,
        `  - text: ${response.text}`,
      );
    }
    push("");
  }
  return `${lines.join("\n")}\n`;
}

await workspace.requireAccount();
const startedAt = new Date().toISOString();
const clips = new Map<string, Clip>();
for (const item of cases) {
  const [voice] = voicesFor(fixtures, item);
  if (voice === undefined) throw new Error(`${item.id} has no voice`);
  clips.set(item.id, await buildClip(workspace.polly, item, voice));
}
const user = await createThrowawayUser(
  {
    region: measuredRegion,
    userPoolId: requiredEnv("USER_POOL_ID"),
    clientId: requiredEnv("USER_POOL_CLIENT_ID"),
    tableName: requiredEnv("TABLE_NAME"),
  },
  "eval-e2e",
);
const sent: Sent[] = [];
const productionTranscriber = modelFacts(defaultGroqWhisperModel);
const pacingKey = pacingKeyOf(defaultGroqWhisperModel);
const ledgerPath = join(dirname(resultsDir), "ledger.jsonl");
const overrides = overridesFrom(values["whisper-daily-kept"]);
const pacer = new Pacer(
  pacingKeys([defaultGroqWhisperModel]),
  readJsonl<LedgerEntry>(ledgerPath),
  undefined,
  overrides,
);
const useOf = (clip: Clip, requests: number) => ({
  requests,
  audioSeconds: billedAudioSeconds(productionTranscriber, clip.seconds) * requests,
  tokens: 0,
});

async function pacedFor(clip: Clip, requests: number): Promise<void> {
  for (;;) {
    const readiness = pacer.readiness(pacingKey, useOf(clip, requests), Date.now());
    if (readiness.kind === "now") return;
    if (readiness.kind === "tomorrow") throw new Error(`paused: ${readiness.reason}`);
    await sleep(readiness.at - Date.now());
  }
}

function recordUse(clip: Clip, requests: number): void {
  appendJsonl(ledgerPath, pacer.record(pacingKey, useOf(clip, requests), Date.now()));
}

const windowStart = Date.now() - 5_000;
try {
  for (const { term, aliases } of fixtures.dictionaries.developer ?? []) {
    await call(user.accessToken, "POST", "/dictionary", { term, aliases });
  }
  const [first] = cases;
  const firstClip = first && clips.get(first.id);
  if (first === undefined || firstClip === undefined) throw new Error("no end-to-end case");
  await settingsWith(user.accessToken, [first.language]);
  await pacedFor(firstClip, burst);
  const opening = await Promise.all(
    Array.from({ length: burst }, () => dictate(user.accessToken, firstClip)),
  );
  recordUse(firstClip, burst);
  opening.forEach((entry, index) => {
    sent.push({ caseId: first.id, phase: "burst", run: index + 1, ...entry });
  });
  for (const item of cases) {
    const clip = clips.get(item.id);
    if (clip === undefined) continue;
    await settingsWith(user.accessToken, [item.language]);
    for (let run = 1; run <= runs; run += 1) {
      await pacedFor(clip, 1);
      sent.push({
        caseId: item.id,
        phase: "warm",
        run,
        ...(await dictate(user.accessToken, clip)),
      });
      recordUse(clip, 1);
      console.log(`${item.id} run ${String(run)} done`);
    }
  }
} finally {
  await user.remove();
  console.log(`throwaway user ${user.username} and its items deleted`);
}

await sleep(20_000);
const windowEnd = Date.now();
const prefix = `/aws/lambda/${workspace.config.name}-dev`;
const dictateCold = (await reports(`${prefix}-dictate`, windowStart, windowEnd)).filter(
  (entry) => entry.initMs !== undefined,
);
const authorizerCold = (await reports(`${prefix}-authorizer`, windowStart, windowEnd)).filter(
  (entry) => entry.initMs !== undefined,
);
markCold(sent, dictateCold);
mkdirSync(resultsDir, { recursive: true });
writeFileSync(
  join(resultsDir, "end-to-end.json"),
  `${JSON.stringify({ startedAt, codeCommit, sent, dictateCold, authorizerCold }, null, 2)}\n`,
);
writeFileSync(reportPath, report(sent, dictateCold, authorizerCold, startedAt));
console.log(`report written to ${fromRoot(reportPath)}`);
