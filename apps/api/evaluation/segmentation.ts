import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Language } from "@take-my-word/shared";
import { estimateTokens, promptWithPreviousText } from "../src/dictation/dictionary-projection.ts";
import { createSilenceGuard, defaultSilenceLevels } from "../src/dictation/silence.ts";
import { defaultSttPromptTokenBudget } from "../src/dictate/config.ts";
import type { Connection, ProviderCall, ProviderRequest } from "../src/eval/contract.ts";
import { seconds, sustainedLevel, withNoise } from "./harness/audio.ts";
import { transcriberCandidates } from "./harness/candidates.ts";
import { buildEvalBundle, type EvalFunction } from "./harness/eval-lambda.ts";
import {
  buildClip,
  isExtended,
  languageModes,
  languagesFor,
  loadTranscriptionFixtures,
  promptFor,
  transcriptionFixturesPath,
  voicesFor,
  type Clip,
  type LanguageMode,
} from "./harness/fixtures.ts";
import type { LedgerEntry } from "./harness/pacing.ts";
import {
  billedAudioSeconds,
  chargedUsd,
  modelFacts,
  planNotes,
  transcriptionCallUsd,
} from "./harness/prices.ts";
import type { Attempt, PlannedItem } from "./harness/scheduler.ts";
import {
  policyId,
  sliceWav,
  spansOf,
  wholeArm,
  type ClipCuts,
  type SegmentPolicy,
  type SegmentRecord,
  type SegmentedResult,
} from "./harness/segmentation-analysis.ts";
import { segmentationReport } from "./harness/segmentation-report.ts";
import { appendJsonl, openResultsDir, paths, readJsonl } from "./harness/store.ts";
import {
  deployAndWarm,
  executePlan,
  headersOf,
  pacingKeyOf,
  recordedSpendUsd,
  requestsSha256,
  requireSynthesisBudget,
  suiteArgs,
  synthesisUsd,
} from "./harness/suite.ts";
import {
  apiRoot,
  evaluationCodePaths,
  fromRoot,
  lastCommitTouching,
  openWorkspace,
  requireCommittedFixtures,
  sha256,
} from "./harness/workspace.ts";

const usage = "usage: pnpm eval:segmentation --results <dir> --report <report.md> [--runs 5]";
const args = suiteArgs(usage, 5);
const workspace = openWorkspace();
const fixtures = loadTranscriptionFixtures();
const suite = "segmentation";

export const policies: SegmentPolicy[] = [
  { enabled: true, minSeconds: 10, maxSeconds: 20, pauseMs: 600 },
  { enabled: true, minSeconds: 20, maxSeconds: 30, pauseMs: 600 },
];

function chosenTranscriber() {
  const requested = process.env.SEGMENTATION_TRANSCRIBER;
  const found = transcriberCandidates.find((candidate) =>
    requested === undefined ? candidate.baseline : candidate.id === requested,
  );
  if (found === undefined) throw new Error(`no transcriber ${requested ?? "baseline"}`);
  return found;
}
const baseline = chosenTranscriber();
const facts = modelFacts(baseline.spec.model);
const isSilence = createSilenceGuard();
const minimumSegmentMs = 500;
const noiseDbfs =
  process.env.SEGMENTATION_NOISE_DBFS === undefined
    ? undefined
    : Number(process.env.SEGMENTATION_NOISE_DBFS);
const clipFolder = noiseDbfs === undefined ? "clips" : `clips-noise${String(noiseDbfs)}`;

async function clipsIn(dir: string): Promise<Clip[]> {
  const clipDir = join(dir, "clips");
  mkdirSync(clipDir, { recursive: true });
  const items = fixtures.cases.filter((item) => isExtended(item.id));
  const missing = items.flatMap((item) =>
    voicesFor(fixtures, item)
      .filter((voice) => !existsSync(join(clipDir, `${item.id}.${voice}.wav`)))
      .map((voice) => ({ item, voice })),
  );
  const characters = missing.reduce(
    (sum, { item }) => sum + (item.kind === "speech" ? item.text.length : 0),
    0,
  );
  if (characters > 0) {
    requireSynthesisBudget(paths(dir, suite), characters);
    for (const { item, voice } of missing) {
      const clip = await buildClip(workspace.polly, item, voice);
      writeFileSync(join(clipDir, `${item.id}.${voice}.wav`), clip.audio);
    }
    appendJsonl(paths(dir, suite).synthesis, {
      at: new Date().toISOString(),
      characters,
      chargedUsd: synthesisUsd(characters),
    });
  }
  const usedDir = join(dir, clipFolder);
  mkdirSync(usedDir, { recursive: true });
  return items.flatMap((item, index) =>
    voicesFor(fixtures, item).map((voice, voiceIndex) => {
      const clean = readFileSync(join(clipDir, `${item.id}.${voice}.wav`));
      const audio =
        noiseDbfs === undefined ? clean : withNoise(clean, noiseDbfs, index * 10 + voiceIndex + 1);
      writeFileSync(join(usedDir, `${item.id}.${voice}.wav`), audio);
      return {
        id: `${item.id}/${voice}`,
        item,
        voice,
        audio,
        seconds: seconds(audio),
        levelDbfs: sustainedLevel(audio),
        sha256: sha256(join(usedDir, `${item.id}.${voice}.wav`)),
      };
    }),
  );
}

function cutsFor(dir: string, clips: readonly Clip[]): ClipCuts[] {
  const out = join(dir, "cuts.json");
  if (!existsSync(out)) {
    const plan = join(dir, "cuts-plan.json");
    writeFileSync(
      plan,
      JSON.stringify({
        policies,
        clips: clips.map((clip) => ({
          id: clip.id,
          wav: execFileSync(
            "wslpath",
            ["-w", join(dir, clipFolder, `${clip.id.replace("/", ".")}.wav`)],
            {
              encoding: "utf8",
            },
          ).trim(),
        })),
      }),
    );
    const script = join(apiRoot, "..", "desktop", "scripts", "windows.sh");
    console.log("running the desktop's detector over the clips on the Windows host");
    const ran = spawnSync(
      script,
      [
        "cargo",
        "test",
        "--locked",
        "segments::detector::tests::writes_the_cut_points_a_session_makes_with_nothing_in_flight",
        "--",
        "--ignored",
        "--exact",
        "--test-threads=1",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          TMW_CUTS_PLAN: plan,
          TMW_CUTS_OUT: out,
          WSLENV: [process.env.WSLENV, "TMW_CUTS_PLAN/p", "TMW_CUTS_OUT/p"]
            .filter(Boolean)
            .join(":"),
        },
      },
    );
    if (ran.status !== 0 || !existsSync(out)) throw new Error("the detector did not write cuts");
  }
  return JSON.parse(readFileSync(out, "utf8")) as ClipCuts[];
}

const callsFor = (mode: LanguageMode, first: boolean) => (mode === "both" && first ? 2 : 1);

interface Chain {
  arm: string;
  spans: { startMs: number; endMs: number; spoken: boolean; last: boolean }[];
}

function chainsFor(clip: Clip, cuts: readonly ClipCuts[]): Chain[] {
  const audioMs = Math.round(clip.seconds * 1000);
  return [
    { arm: wholeArm, spans: [{ startMs: 0, endMs: audioMs, spoken: true, last: true }] },
    ...policies.map((policy) => {
      const found = cuts.find(
        (entry) => entry.id === clip.id && policyId(entry.policy) === policyId(policy),
      );
      if (found === undefined) throw new Error(`no cuts for ${clip.id} ${policyId(policy)}`);
      return { arm: policyId(policy), spans: spansOf(found.cuts, found.audioMs) };
    }),
  ];
}

function plan(
  evalFunction: () => Promise<EvalFunction>,
  clips: readonly Clip[],
  cuts: readonly ClipCuts[],
  runs: number,
  requests: { id: string; request: ProviderRequest }[],
): PlannedItem<SegmentedResult>[] {
  const items: PlannedItem<SegmentedResult>[] = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const clip of clips) {
      const termsPrompt = promptFor(fixtures, clip.item.dictionary);
      for (const mode of languageModes) {
        for (const chain of chainsFor(clip, cuts)) {
          const connection: Connection = run === 1 ? "fresh" : "reused";
          const id = `${chain.arm}|${clip.id}|${mode}|${String(run)}`;
          const sent = chain.spans.filter((span) => span.spoken);
          const estimate = sent.reduce(
            (sum, span, index) => {
              const spanSeconds = (span.endMs - span.startMs) / 1000;
              const calls = callsFor(mode, index === 0);
              return {
                requests: sum.requests + calls,
                audioSeconds: sum.audioSeconds + billedAudioSeconds(facts, spanSeconds) * calls,
                tokens: 0,
                costUsd:
                  sum.costUsd + chargedUsd(facts, transcriptionCallUsd(facts, spanSeconds) * calls),
              };
            },
            { requests: 0, audioSeconds: 0, tokens: 0, costUsd: 0 },
          );
          requests.push({
            id,
            request: {
              kind: "transcribe",
              connection,
              transcriber: baseline.id,
              audioBase64: clip.audio.toString("base64"),
              container: "wav",
              languages: languagesFor(clip.item, mode),
              prompt: `${termsPrompt}|${JSON.stringify(chain.spans)}`,
            },
          });
          const base = {
            id,
            arm: chain.arm,
            candidate: chain.arm,
            caseId: clip.item.id,
            voice: clip.voice,
            mode,
            run,
            connection,
            audioSeconds: clip.seconds,
            levelDbfs: clip.levelDbfs,
          };
          items.push({
            id,
            pacingKey: pacingKeyOf(baseline.spec.model),
            estimate,
            exhausted: (failure) => ({
              ...base,
              ok: false,
              error: failure,
              segments: [],
              calls: [],
              coldStart: false,
              region: "",
              memoryMb: 0,
              listUsd: 0,
              chargedUsd: 0,
              at: new Date().toISOString(),
            }),
            run: async (): Promise<Attempt<SegmentedResult>> => {
              const calls: ProviderCall[] = [];
              const segments: SegmentRecord[] = [];
              let listUsd = 0;
              let billed = 0;
              let firstLanguage: Language | undefined;
              let coldStart = false;
              let region = "";
              let memoryMb = 0;
              const languages = languagesFor(clip.item, mode);
              try {
                for (const span of chain.spans) {
                  const record = { startMs: span.startMs, endMs: span.endMs, text: "", calls: 0 };
                  const previous = segments
                    .map((segment) => segment.text.trim())
                    .filter((text) => text !== "")
                    .join(" ");
                  const prompted = promptWithPreviousText(
                    termsPrompt,
                    previous,
                    defaultSttPromptTokenBudget,
                  );
                  const audio = sliceWav(clip.audio, span.startMs, span.endMs);
                  const level = sustainedLevel(audio);
                  const skipped = !span.spoken
                    ? ("unspoken" as const)
                    : span.endMs - span.startMs < minimumSegmentMs
                      ? ("short" as const)
                      : level < defaultSilenceLevels.floorDbfs
                        ? ("silence" as const)
                        : undefined;
                  if (skipped !== undefined) {
                    segments.push({
                      ...record,
                      termsTokens: baseline.spec.prompted ? estimateTokens(termsPrompt) : 0,
                      tailTokens: 0,
                      skipped,
                    });
                    continue;
                  }
                  const response = await (
                    await evalFunction()
                  ).invoke({
                    kind: "transcribe",
                    connection: calls.length === 0 ? connection : "reused",
                    transcriber: baseline.id,
                    audioBase64: audio.toString("base64"),
                    container: "wav",
                    languages:
                      firstLanguage !== undefined && languages.includes(firstLanguage)
                        ? [firstLanguage]
                        : languages,
                    prompt: prompted.prompt,
                  });
                  calls.push(...response.calls);
                  coldStart ||= response.coldStart;
                  region = response.region;
                  memoryMb = response.memoryMb;
                  const spanSeconds = (span.endMs - span.startMs) / 1000;
                  for (const call of response.calls) {
                    listUsd += transcriptionCallUsd(facts, spanSeconds, call.usage);
                    billed += billedAudioSeconds(facts, spanSeconds, call.usage);
                  }
                  if (!response.ok) {
                    const charged = chargedUsd(facts, listUsd);
                    return {
                      usage: { requests: calls.length, audioSeconds: billed, tokens: 0 },
                      costUsd: charged,
                      headers: headersOf(calls),
                      failure: response.error ?? { message: "segment failed" },
                    };
                  }
                  const text = response.text ?? "";
                  const quiet = level < defaultSilenceLevels.speechLevelDbfs;
                  firstLanguage ??= response.language;
                  segments.push({
                    ...record,
                    text: isSilence({ text, quiet }) ? "" : text,
                    ...(response.language !== undefined && { language: response.language }),
                    termsTokens: baseline.spec.prompted ? estimateTokens(termsPrompt) : 0,
                    tailTokens: baseline.spec.prompted ? prompted.tailBytes : 0,
                    calls: response.calls.length,
                  });
                }
              } catch (error) {
                return {
                  usage: { requests: calls.length, audioSeconds: billed, tokens: 0 },
                  costUsd: chargedUsd(facts, listUsd),
                  headers: headersOf(calls),
                  failure: { message: error instanceof Error ? error.message : "unknown" },
                };
              }
              const charged = chargedUsd(facts, listUsd);
              const text = segments
                .map((segment) => segment.text.trim())
                .filter((segment) => segment !== "")
                .join(" ");
              const result: SegmentedResult = {
                ...base,
                ok: true,
                text,
                ...(firstLanguage !== undefined && { language: firstLanguage }),
                segments,
                calls,
                coldStart,
                region,
                memoryMb,
                listUsd,
                chargedUsd: charged,
                at: new Date().toISOString(),
              };
              return {
                result,
                usage: { requests: calls.length, audioSeconds: billed, tokens: 0 },
                costUsd: charged,
                headers: headersOf(calls),
              };
            },
          });
        }
      }
    }
  }
  return items;
}

async function measure(results: string, reportPath: string): Promise<void> {
  const state = requireCommittedFixtures(transcriptionFixturesPath, evaluationCodePaths);
  const codeCommit = lastCommitTouching(evaluationCodePaths);
  const clips = await clipsIn(results);
  console.log(
    `${String(clips.length)} clips, ${clips.reduce((sum, clip) => sum + clip.seconds, 0).toFixed(0)} s of audio`,
  );
  const cuts = cutsFor(results, clips);
  const bundle = await buildEvalBundle();
  const requests: { id: string; request: ProviderRequest }[] = [];
  let deployed: Promise<EvalFunction> | undefined;
  const evalFunction = () => (deployed ??= deployAndWarm(workspace, bundle));
  const items = plan(evalFunction, clips, cuts, args.runs, requests);
  const dir = openResultsDir(
    results,
    {
      suite,
      fixturesSha256: sha256(transcriptionFixturesPath),
      codeCommit,
      runs: args.runs,
      requestsSha256: requestsSha256(requests),
      evalBundleSha256: bundle.sha256,
      clips: Object.fromEntries(clips.map((clip) => [clip.id, clip.sha256])),
    },
    new Date(),
  );
  console.log(`code ${codeCommit} (HEAD ${state.commit})`);
  const done = new Set(readJsonl<SegmentedResult>(dir.results).map((result) => result.id));
  const pending = items.filter((item) => !done.has(item.id));
  const complete =
    pending.length === 0 ||
    (await executePlan(dir, [baseline.spec.model], pending, { overrides: args.overrides }));
  if (!complete) return;
  writeFileSync(
    reportPath,
    segmentationReport({
      command: `pnpm --filter @take-my-word/api eval:segmentation --results ${fromRoot(results)} --report ${fromRoot(reportPath)} --runs ${String(args.runs)}`,
      generatedAt: new Date().toISOString(),
      codeCommit: [dir.meta.codeCommit, ...(dir.meta.resumedWith ?? [])].join("`, resumed with `"),
      runs: args.runs,
      transcriber: baseline.id,
      prompted: baseline.spec.prompted,
      ...(noiseDbfs !== undefined && { noiseDbfs }),
      promptTokenBudget: defaultSttPromptTokenBudget,
      chargedUsd: recordedSpendUsd(dir),
      planNotes: planNotes(readJsonl<LedgerEntry>(dir.ledger)),
      fixtures,
      clips,
      cuts,
      policies: policies.map(policyId),
      results: readJsonl<SegmentedResult>(dir.results),
    }),
  );
  console.log(`report written to ${fromRoot(reportPath)}`);
}

if (args.results === undefined || args.report === undefined) {
  console.error(usage);
  process.exit(2);
}
await measure(args.results, args.report);
