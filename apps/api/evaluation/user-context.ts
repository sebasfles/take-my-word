import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { signIn } from "@take-my-word/cognito";
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
const admin = new CognitoIdentityProviderClient({ region });
const table = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

async function createUser() {
  const username = `eval-context-${randomBytes(4).toString("hex")}`;
  const password = `Tmw-${randomBytes(12).toString("hex")}-Aa1`;
  const created = await admin.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      TemporaryPassword: password,
      MessageAction: "SUPPRESS",
    }),
  );
  const sub = created.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
  if (sub === undefined) throw new Error(`${username} has no sub`);
  await admin.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );
  return { username, password, sub };
}

async function removeUser(user: { username: string; sub: string }) {
  await admin.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: user.username }));
  let start: Record<string, unknown> | undefined;
  do {
    const page = await table.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${user.sub}` },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: start,
      }),
    );
    const keys = (page.Items ?? []).map((item) => ({ PK: String(item.PK), SK: String(item.SK) }));
    for (let index = 0; index < keys.length; index += 25) {
      let pending: Record<string, { DeleteRequest: { Key: Record<string, string> } }[]> = {
        [tableName]: keys.slice(index, index + 25).map((Key) => ({ DeleteRequest: { Key } })),
      };
      for (let attempt = 0; (pending[tableName]?.length ?? 0) > 0; attempt += 1) {
        if (attempt > 5) throw new Error(`items of ${user.username} left after batch deletes`);
        if (attempt > 0) await sleep(100 * 2 ** attempt);
        const { UnprocessedItems } = await table.send(
          new BatchWriteCommand({ RequestItems: pending }),
        );
        pending = (UnprocessedItems ?? {}) as typeof pending;
      }
    }
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
}

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

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFC")
    .split(/[\s.,;:!?¿¡"“”()]+/)
    .map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word !== "");

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const has = (text: string, term: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);

const missedTerms = (text: string, sample: Sample) =>
  sample.terms.filter((term) => !has(text, term));

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
  lines.push("", "## Every word not in the expected text", "");
  for (const sample of fixture.samples) {
    lines.push(`### ${sample.id}`, "", `Expected: ${sample.text}`, "");
    for (const mode of languageModes) {
      for (const withContext of [false, true]) {
        const condition = results.filter(
          (result) =>
            result.sample === sample && result.mode === mode && result.withContext === withContext,
        );
        const extras = condition.flatMap((result) => extraWords(result.text, sample));
        const missed = condition.flatMap((result) => missedTerms(result.text, sample));
        const flipped = condition.filter((result) => result.locale !== sample.language).length;
        lines.push(
          `- ${mode}, ${withContext ? "with context" : "without"}: extra words [${extras.join(", ")}]; missed terms [${missed.join(", ")}]; flips ${String(flipped)}`,
        );
        for (const result of condition) lines.push(`  - run ${String(result.run)}: ${result.text}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

const user = await createUser();
try {
  const signedIn = await signIn({
    userPoolId,
    clientId,
    username: user.username,
    password: user.password,
  });
  if (signedIn.kind !== "signed-in") throw new Error(`${user.username} could not sign in`);
  const session = client(signedIn.session.accessToken);
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
  console.log(`report written to ${out}`);
} finally {
  await removeUser(user);
}
