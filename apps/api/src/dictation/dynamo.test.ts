import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { dynamoDictationStore, dynamoQuotaStore } from "./dynamo.ts";

function client(send: (command: { input: Record<string, unknown> }) => Promise<unknown>) {
  return { send } as unknown as DynamoDBDocumentClient;
}

const charge = { userId: "u1", day: "2026-10-20", seconds: 12, capSeconds: 3600, expiresAt: 1 };

describe("dynamoQuotaStore", () => {
  it("allows the charge when the conditional update succeeds", async () => {
    const store = dynamoQuotaStore(
      client(() => Promise.resolve({})),
      "t",
    );
    expect(await store.charge(charge)).toBe(true);
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
