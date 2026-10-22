import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  type BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import {
  appRuleSchema,
  dictationResponseSchema,
  dictionaryTermSchema,
  historyPageSchema,
  styleSchema,
  type HistoryItem,
} from "@take-my-word/shared";
import { signIn } from "@take-my-word/cognito";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

const region = "us-east-1";
const userPoolId = () => env("USER_POOL_ID");
const admin = new CognitoIdentityProviderClient({ region });
const table = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

export interface ThrowawayUser {
  username: string;
  password: string;
  sub: string;
}

export async function createUser(created: ThrowawayUser[]): Promise<ThrowawayUser> {
  const username = `web-e2e-${randomBytes(4).toString("hex")}`;
  const password = `Tmw-${randomBytes(12).toString("hex")}-Aa1`;
  const response = await admin.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId(),
      Username: username,
      TemporaryPassword: password,
      MessageAction: "SUPPRESS",
    }),
  );
  const sub = response.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
  if (sub === undefined) throw new Error(`${username} has no sub`);
  const user = { username, password, sub };
  created.push(user);
  await admin.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId(),
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );
  return user;
}

const batchAttempts = 6;

async function deleteBatch(requests: BatchWriteCommandInput["RequestItems"]): Promise<void> {
  let pending = requests;
  for (let attempt = 0; attempt < batchAttempts; attempt += 1) {
    if (attempt > 0) await sleep(100 * 2 ** attempt);
    const { UnprocessedItems } = await table.send(new BatchWriteCommand({ RequestItems: pending }));
    pending = UnprocessedItems;
    if (pending === undefined || Object.values(pending).every((items) => items.length === 0)) {
      return;
    }
  }
  throw new Error(`items left after ${String(batchAttempts)} batch deletes`);
}

async function deleteItems(sub: string): Promise<void> {
  const tableName = env("TABLE_NAME");
  let start: Record<string, unknown> | undefined;
  do {
    const page = await table.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${sub}` },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: start,
      }),
    );
    const keys = (page.Items ?? []).map((item) => ({ PK: String(item.PK), SK: String(item.SK) }));
    for (let index = 0; index < keys.length; index += 25) {
      await deleteBatch({
        [tableName]: keys.slice(index, index + 25).map((key) => ({ DeleteRequest: { Key: key } })),
      });
    }
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
}

export async function removeUser(user: ThrowawayUser): Promise<void> {
  await admin.send(
    new AdminDeleteUserCommand({ UserPoolId: userPoolId(), Username: user.username }),
  );
  await deleteItems(user.sub);
}

export async function accessToken(user: ThrowawayUser): Promise<string> {
  const result = await signIn({
    userPoolId: userPoolId(),
    clientId: env("USER_POOL_CLIENT_ID"),
    username: user.username,
    password: user.password,
  });
  if (result.kind !== "signed-in") throw new Error(`${user.username} could not sign in`);
  return result.session.accessToken;
}

export function apiClient(token: string) {
  const base = env("API_URL");
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${path} answered ${String(response.status)}`);
    const text = await response.text();
    return text === "" ? undefined : (JSON.parse(text) as unknown);
  }

  return {
    addTerm: async (term: string, aliases: string[]) =>
      dictionaryTermSchema.parse(await call("POST", "/dictionary", { term, aliases })),
    addStyle: async (name: string, prompt: string) =>
      styleSchema.parse(await call("POST", "/styles", { name, prompt })),
    setDefaultStyle: (defaultStyleId: string) =>
      call("PUT", "/me/settings", {
        defaultStyleId,
        dictationLanguages: ["es"],
        providers: { transcriber: "groq-whisper", refiner: "openai" },
      }),
    addRule: async (appId: string, styleId: string) =>
      appRuleSchema.parse(
        await call("POST", "/app-rules", { appId, styleId, keystroke: "ctrl+v" }),
      ),
    history: async (): Promise<HistoryItem[]> =>
      historyPageSchema.parse(await call("GET", "/dictations?limit=100")).items,
    dictate: async (audio: Buffer) => {
      const form = new FormData();
      form.append("meta", JSON.stringify({ locale: "es" }));
      form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "dictation");
      const response = await fetch(`${base}/dictations`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      if (!response.ok) throw new Error(`POST /dictations answered ${String(response.status)}`);
      return dictationResponseSchema.parse(await response.json());
    },
  };
}

function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesize(text: string): Promise<Buffer> {
  const { AudioStream } = await new PollyClient({ region }).send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      VoiceId: "Lupe",
      LanguageCode: "es-US",
      OutputFormat: "pcm",
      SampleRate: "16000",
      Text: text,
    }),
  );
  if (!AudioStream) throw new Error("Polly returned no audio");
  return pcmToWav(Buffer.from(await AudioStream.transformToByteArray()));
}
