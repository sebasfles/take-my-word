import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  dictationResponseSchema,
  historyPageSchema,
  settingsSchema,
  userContextSchema,
  type Language,
  type UserContext,
} from "@take-my-word/shared";
import { z } from "zod";
import { synthesize } from "../e2e/speech.ts";
import { loadWorkspaceEnv, requiredEnv } from "../scripts/sign-in.ts";
import { missedTerms as missed, wordsOf } from "./harness/metrics.ts";
import { createThrowawayUser } from "./harness/throwaway-user.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: node evaluation/user-context.ts <report.md>");
  process.exit(2);
}

const runs = 3;
const region = "us-east-1";

const fixtureSchema = z.object({
  contexts: z.record(z.string(), userContextSchema),
  samples: z.array(
    z.object({
      id: z.string(),
      language: z.enum(["es", "en"]),
      context: z.string(),
      text: z.string(),
      terms: z.array(z.string()),
    }),
  ),
});
type Sample = z.infer<typeof fixtureSchema>["samples"][number];

const fixture = fixtureSchema.parse(
  JSON.parse(readFileSync(join(import.meta.dirname, "user-context.samples.json"), "utf8")),
);

type LanguageMode = "one" | "both";
const languageModes: LanguageMode[] = ["one", "both"];
const bothLanguages: Language[] = ["es", "en"];

interface Result {
  sample: Sample;
  mode: LanguageMode;
  withContext: boolean;
  run: number;
  raw: string;
  text: string;
  locale: string;
}

loadWorkspaceEnv();
const api = requiredEnv("API_URL");
const userPoolId = requiredEnv("USER_POOL_ID");
const clientId = requiredEnv("USER_POOL_CLIENT_ID");
const tableName = requiredEnv("TABLE_NAME");
function client(token: string) {
  const headers = { authorization: `Bearer ${token}` };
  return {
    async saveSettings(languages: Language[], context: UserContext) {
      const current = settingsSchema.parse(
        await (await fetch(`${api}/me/settings`, { headers })).json(),
      );
      const response = await fetch(`${api}/me/settings`, {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ ...current, dictationLanguages: languages, context }),
      });
      if (!response.ok) throw new Error(`PUT /me/settings answered ${String(response.status)}`);
    },
    async dictate(audio: Buffer) {
      for (let attempt = 1; ; attempt += 1) {
        const form = new FormData();
        form.append("meta", JSON.stringify({}));
        form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "sample");
        const response = await fetch(`${api}/dictations`, { method: "POST", headers, body: form });
        if (response.ok) {
          const body = dictationResponseSchema.parse(await response.json());
          const history = historyPageSchema.parse(
            await (await fetch(`${api}/dictations?limit=1`, { headers })).json(),
          );
          return { raw: body.raw, text: body.text, locale: history.items[0]?.locale ?? "" };
        }
        if (attempt === 4 || response.status !== 502) {
          throw new Error(`POST /dictations answered ${String(response.status)}`);
        }
        await sleep(5_000 * attempt);
      }
    },
  };
}

const missedTerms = (text: string, sample: Sample) => missed(text, sample.terms);

function extraWords(text: string, sample: Sample): string[] {
  const expected = new Set(wordsOf(sample.text));
  return wordsOf(text).filter((word) => !expected.has(word));
}

function report(results: Result[]): string {
  const lines: string[] = [];
  const count = (filter: (result: Result) => boolean, measure: (result: Result) => number) =>
    results.filter(filter).reduce((sum, result) => sum + measure(result), 0);
  const groups = [...new Set(fixture.samples.map((sample) => sample.id.replace(/-\d+$/, "")))];
  const termTotal = (group: string) =>
    fixture.samples
      .filter((sample) => sample.id.startsWith(`${group}-`))
      .reduce((sum, sample) => sum + sample.terms.length, 0) * runs;

  lines.push("# User context evaluation", "");
  lines.push(
    `Run on ${new Date().toISOString()} against ${api}, ${String(runs)} runs per sample and condition; Polly neural voices, dictation languages "one" (the sample's) or "both" (${bothLanguages.join(", ")}).`,
    "",
  );
  lines.push(
    "| Group | Languages | Term errors in text, without | with | Term errors in raw, without | with | Language flips, without | with |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const group of groups) {
    for (const mode of languageModes) {
      const of = (withContext: boolean) => (result: Result) =>
        result.sample.id.startsWith(`${group}-`) &&
        result.mode === mode &&
        result.withContext === withContext;
      const total = termTotal(group);
      const cell = (withContext: boolean, field: "text" | "raw") =>
        `${String(count(of(withContext), (result) => missedTerms(result[field], result.sample).length))}/${String(total)}`;
      const flips = (withContext: boolean) =>
        String(
          count(of(withContext), (result) => (result.locale === result.sample.language ? 0 : 1)),
        );
      lines.push(
        `| ${group} | ${mode} | ${cell(false, "text")} | ${cell(true, "text")} | ${cell(false, "raw")} | ${cell(true, "raw")} | ${flips(false)} | ${flips(true)} |`,
      );
    }
  }
  lines.push(
    "",
    "## Every word not in the expected text",
    "",
    "Per condition: words of the clean text not in the expected sentence, missed terms in the raw transcript and in the clean text, and each run as raw then text.",
    "",
  );
  for (const sample of fixture.samples) {
    lines.push(`### ${sample.id}`, "", `Expected: ${sample.text}`, "");
    for (const mode of languageModes) {
      for (const withContext of [false, true]) {
        const condition = results.filter(
          (result) =>
            result.sample === sample && result.mode === mode && result.withContext === withContext,
        );
        const extras = condition.flatMap((result) => extraWords(result.text, sample));
        const missedRaw = condition.flatMap((result) => missedTerms(result.raw, sample));
        const missed = condition.flatMap((result) => missedTerms(result.text, sample));
        const flipped = condition.filter((result) => result.locale !== sample.language).length;
        lines.push(
          `- ${mode}, ${withContext ? "with context" : "without"}: extra words [${extras.join(", ")}]; missed terms raw [${missedRaw.join(", ")}], text [${missed.join(", ")}]; flips ${String(flipped)}`,
        );
        for (const result of condition) {
          lines.push(`  - run ${String(result.run)} raw: ${result.raw}`);
          lines.push(`    text: ${result.text}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const user = await createThrowawayUser({ region, userPoolId, clientId, tableName }, "eval-context");
try {
  const session = client(user.accessToken);
  const audio = new Map<string, Buffer>();
  for (const sample of fixture.samples) {
    audio.set(sample.id, await synthesize(sample.text, sample.language));
  }
  const results: Result[] = [];
  for (const mode of languageModes) {
    for (const withContext of [false, true]) {
      for (const sample of fixture.samples) {
        const context = withContext ? fixture.contexts[sample.context] : undefined;
        if (withContext && context === undefined) throw new Error(`no context ${sample.context}`);
        await session.saveSettings(
          mode === "one" ? [sample.language] : bothLanguages,
          context ?? { picks: [], detail: "" },
        );
        for (let run = 1; run <= runs; run += 1) {
          const clip = audio.get(sample.id);
          if (clip === undefined) throw new Error(`no audio for ${sample.id}`);
          results.push({ sample, mode, withContext, run, ...(await session.dictate(clip)) });
          console.log(
            `${sample.id} ${mode} ${withContext ? "with" : "without"} run ${String(run)} done`,
          );
        }
      }
    }
  }
  writeFileSync(out, report(results));
  writeFileSync(
    out.replace(/\.md$/, "") + ".json",
    `${JSON.stringify(
      results.map(({ sample, ...result }) => ({ id: sample.id, ...result })),
      null,
      2,
    )}\n`,
  );
  console.log(`report written to ${out}`);
} finally {
  await user.remove();
}
