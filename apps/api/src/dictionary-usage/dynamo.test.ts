import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { dynamoUsageStore } from "./dynamo.ts";

interface Input {
  Key: Record<string, string>;
  UpdateExpression: string;
  ConditionExpression: string;
  ExpressionAttributeValues: Record<string, unknown>;
}

function store(send: (input: Input) => Promise<unknown>) {
  const client = { send: (command: { input: Input }) => send(command.input) };
  return dynamoUsageStore({ client: client as unknown as DynamoDBDocumentClient, name: "t" });
}

describe("dynamoUsageStore.recordUse", () => {
  it("increments only an existing term last used before the dictation", async () => {
    let input: Input | undefined;
    const counted = await store((sent) => {
      input = sent;
      return Promise.resolve({});
    }).recordUse("USER#u1", "kubernetes", "2026-10-21T10:00:00.000Z");
    expect(counted).toBe(true);
    expect(input?.Key).toEqual({ PK: "USER#u1", SK: "DICT#kubernetes" });
    expect(input?.UpdateExpression).toBe("ADD useCount :one SET lastUsedAt = :usedAt");
    expect(input?.ConditionExpression).toBe("attribute_exists(SK) AND lastUsedAt < :usedAt");
    expect(input?.ExpressionAttributeValues).toEqual({
      ":one": 1,
      ":usedAt": "2026-10-21T10:00:00.000Z",
    });
  });

  it("answers false when the term is gone or already counted", async () => {
    const failed = new ConditionalCheckFailedException({ message: "failed", $metadata: {} });
    expect(await store(() => Promise.reject(failed)).recordUse("USER#u1", "k", "t")).toBe(false);
  });
});
