import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { dynamoHistoryStore } from "./dynamo.ts";

interface QueryInput {
  KeyConditionExpression: string;
  ExpressionAttributeValues: Record<string, unknown>;
  ExpressionAttributeNames: Record<string, string>;
  ProjectionExpression: string;
  ExclusiveStartKey?: Record<string, unknown>;
  ScanIndexForward: boolean;
}

function capture() {
  const inputs: QueryInput[] = [];
  const client = {
    send: (command: { input: QueryInput }) => {
      inputs.push(command.input);
      return Promise.resolve({ Items: [], LastEvaluatedKey: { PK: "USER#u1", SK: "DICTATION#z" } });
    },
  };
  return {
    store: dynamoHistoryStore({ client: client as unknown as DynamoDBDocumentClient, name: "t" }),
    inputs,
  };
}

describe("dynamoHistoryStore.page", () => {
  it("reads the caller's dictations newest first, projecting reserved words through placeholders", async () => {
    const { store, inputs } = capture();
    const page = await store.page("u1", { limit: 5, after: "DICTATION#b" });
    const input = inputs[0];
    expect(input?.ExpressionAttributeValues).toMatchObject({
      ":pk": "USER#u1",
      ":prefix": "DICTATION#",
    });
    expect(input?.ExclusiveStartKey).toEqual({ PK: "USER#u1", SK: "DICTATION#b" });
    expect(input?.ScanIndexForward).toBe(false);
    expect(input?.ProjectionExpression).toMatch(/^(#p\d+)(, #p\d+)*$/);
    expect(Object.values(input?.ExpressionAttributeNames ?? {})).toEqual(
      expect.arrayContaining(["text", "raw", "locale"]),
    );
    expect(page.last).toBe("DICTATION#z");
  });
});
