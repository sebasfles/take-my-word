import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { dynamoDictationStore, dynamoQuotaStore } from "./dynamo.ts";

function client(send: (command: { input: Record<string, unknown> }) => Promise<unknown>) {
  return { send } as unknown as DynamoDBDocumentClient;
}

const charge = {
  userId: "u1",
  day: "2026-10-20",
  seconds: 12,
  capSeconds: 3600,
  expiresAt: 1_792_800_000,
};

interface UpdateInput {
  TableName: string;
  Key: Record<string, unknown>;
  UpdateExpression: string;
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

function resolve(input: UpdateInput, pattern: RegExp, expression: string): [string, unknown] {
  const match = pattern.exec(expression);
  const [name, value] = [match?.[1] ?? "", match?.[2] ?? ""];
  return [input.ExpressionAttributeNames[name] ?? name, input.ExpressionAttributeValues[value]];
}

describe("dynamoQuotaStore", () => {
  it("adds the seconds to the user's day counter, sets its TTL and conditions on the cap", async () => {
    let input: UpdateInput | undefined;
    const store = dynamoQuotaStore(
      client((command) => {
        input = command.input as unknown as UpdateInput;
        return Promise.resolve({});
      }),
      "take-my-word-dev",
    );
    expect(await store.charge(charge)).toBe(true);
    if (!input) throw new Error("no command sent");
    expect(input.TableName).toBe("take-my-word-dev");
    expect(input.Key).toEqual({ PK: "USER#u1", SK: "QUOTA#2026-10-20" });
    expect(resolve(input, /ADD (\S+) (\S+)/, input.UpdateExpression)).toEqual(["seconds", 12]);
    expect(resolve(input, /SET (\S+) = (\S+)/, input.UpdateExpression)).toEqual([
      "expiresAt",
      1_792_800_000,
    ]);
    expect(resolve(input, /(\S+) < (\S+)/, input.ConditionExpression)).toEqual(["seconds", 3600]);
    expect(resolve(input, /attribute_not_exists\((\S+)\)/, input.ConditionExpression)[0]).toBe(
      "seconds",
    );
  });

  it("refuses the charge when the cap condition fails", async () => {
    const failed = new ConditionalCheckFailedException({ message: "failed", $metadata: {} });
    const store = dynamoQuotaStore(
      client(() => Promise.reject(failed)),
      "t",
    );
    expect(await store.charge(charge)).toBe(false);
  });

  it("surfaces any other failure", async () => {
    const store = dynamoQuotaStore(
      client(() => Promise.reject(new Error("throttled"))),
      "t",
    );
    await expect(store.charge(charge)).rejects.toThrow("throttled");
  });
});

describe("dynamoDictationStore", () => {
  it("writes text and measurements under the user, with a TTL 90 days out and no audio", async () => {
    let item: Record<string, unknown> = {};
    const store = dynamoDictationStore(
      client((command) => {
        item = command.input.Item as Record<string, unknown>;
        return Promise.resolve({});
      }),
      "t",
    );
    const createdAt = new Date("2026-10-20T12:00:00.000Z");
    await store.save({
      userId: "u1",
      requestId: "r1",
      createdAt,
      locale: "es",
      audioSeconds: 7,
      raw: "eh hola",
      text: "Hola.",
      providers: { transcriber: "groq-whisper", refiner: "openai:gpt-5.4-nano" },
      latencyMs: { quota: 5, transcribe: 300, refine: 400 },
      tokens: { inputTokens: 90, outputTokens: 4 },
    });
    expect(item.PK).toBe("USER#u1");
    expect(String(item.SK) > "DICTATION#2026-10-20T11:59:59.999Z").toBe(true);
    expect(item.expiresAt).toBe(Date.parse("2027-01-18T12:00:00.000Z") / 1000);
    expect(item).toMatchObject({ raw: "eh hola", text: "Hola.", tokens: { inputTokens: 90 } });
    expect(Object.values(item).some((value) => Buffer.isBuffer(value))).toBe(false);
  });
});
