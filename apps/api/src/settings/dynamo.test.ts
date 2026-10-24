import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { dynamoSettingsStore } from "./dynamo.ts";

interface UpdateInput {
  Key: Record<string, unknown>;
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

function applied(input: UpdateInput, stored: Record<string, unknown>): Record<string, unknown> {
  const item = { ...stored };
  for (const assignment of input.UpdateExpression.replace(/^SET /, "").split(", ")) {
    const [name = "", value = ""] = assignment.split(" = ");
    item[input.ExpressionAttributeNames[name] ?? name] = input.ExpressionAttributeValues[value];
  }
  return item;
}

describe("dynamoSettingsStore", () => {
  it("replaces every settings field and leaves the providers a released client stored untouched", async () => {
    const stored = {
      PK: "USER#u1",
      SK: "SETTINGS",
      defaultStyleId: "plain",
      locale: "es",
      dictationLanguages: ["es"],
      providers: { transcriber: "groq-whisper", refiner: "openai" },
      context: { picks: ["law"], detail: "contracts" },
    };
    let input: UpdateInput | undefined;
    const store = dynamoSettingsStore({
      client: {
        send: (command: { input: UpdateInput }) => {
          input = command.input;
          return Promise.resolve({});
        },
      } as unknown as DynamoDBDocumentClient,
      name: "t",
    });
    const next = {
      defaultStyleId: "formal",
      locale: "en",
      dictationLanguages: ["en" as const],
      context: { picks: [], detail: "" },
    };
    await store.put("u1", next);
    expect(input?.Key).toEqual({ PK: "USER#u1", SK: "SETTINGS" });
    expect(applied(input as UpdateInput, stored)).toEqual({
      PK: "USER#u1",
      SK: "SETTINGS",
      ...next,
      providers: stored.providers,
    });
  });
});
