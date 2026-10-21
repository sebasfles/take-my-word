import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { dynamoHistoryStore } from "./dynamo.ts";

interface QueryInput {
  KeyConditionExpression: string;
  FilterExpression?: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, string | number>;
  ProjectionExpression: string;
  ExclusiveStartKey?: { PK: string; SK: string };
  ScanIndexForward: boolean;
  Limit: number;
}

type Row = Record<string, string | number>;

const now = new Date("2026-10-21T12:00:00.000Z");
const nowSeconds = now.getTime() / 1000;

function row(pk: string, minute: number, expired = false): Row {
  const createdAt = `2026-10-21T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return {
    PK: pk,
    SK: `DICTATION#${createdAt}#r${String(minute)}`,
    createdAt,
    locale: "es",
    text: `texto ${String(minute)}`,
    raw: `crudo ${String(minute)}`,
    audioSeconds: 2,
    expiresAt: expired ? nowSeconds : nowSeconds + 3600,
  };
}

function fakeTable(rows: Row[]) {
  const inputs: QueryInput[] = [];
  const client = {
    send: ({ input }: { input: QueryInput }) => {
      inputs.push(input);
      const values = input.ExpressionAttributeValues;
      const evaluated = rows
        .filter((item) => item.PK === values[":pk"])
        .filter((item) => String(item.SK).startsWith(String(values[":prefix"])))
        .sort((a, b) => String(b.SK).localeCompare(String(a.SK)))
        .filter((item) => !input.ExclusiveStartKey || String(item.SK) < input.ExclusiveStartKey.SK)
        .slice(0, input.Limit);
      const filter = /^(#\w+) > (:\w+)$/.exec(input.FilterExpression ?? "");
      const kept = filter
        ? evaluated.filter(
            (item) =>
              Number(item[input.ExpressionAttributeNames[filter[1] ?? ""] ?? ""]) >
              Number(values[filter[2] ?? ""]),
          )
        : evaluated;
      const last = evaluated.length === input.Limit ? evaluated.at(-1) : undefined;
      return Promise.resolve({
        Items: kept,
        ...(last && { LastEvaluatedKey: { PK: last.PK, SK: last.SK } }),
      });
    },
  };
  const store = dynamoHistoryStore({
    client: client as unknown as DynamoDBDocumentClient,
    name: "t",
  });
  return { store, inputs };
}

describe("dynamoHistoryStore.page", () => {
  it("hides dictations past their expiry that TTL has not deleted yet", async () => {
    const { store } = fakeTable([row("USER#u1", 3, true), row("USER#u1", 2), row("USER#u1", 1)]);
    const { entries } = await store.page("u1", { limit: 5, now });
    expect(entries.map((entry) => entry.text)).toEqual(["texto 2", "texto 1"]);
  });

  it("fills a page across expired items and continues after its last entry", async () => {
    const rows = [5, 4, 3, 2, 1].map((minute) => row("USER#u1", minute, [4, 3].includes(minute)));
    const { store } = fakeTable(rows);
    const first = await store.page("u1", { limit: 2, now });
    expect(first.entries.map((entry) => entry.text)).toEqual(["texto 5", "texto 2"]);
    expect(first.last).toBe(rows[3]?.SK);
    const second = await store.page("u1", { limit: 2, now, after: first.last ?? "" });
    expect(second.entries.map((entry) => entry.text)).toEqual(["texto 1"]);
    expect(second.last).toBeUndefined();
  });

  it("reads only the caller's partition, projecting reserved words through placeholders", async () => {
    const { store, inputs } = fakeTable([row("USER#u2", 9), row("USER#u1", 1)]);
    const { entries } = await store.page("u1", { limit: 5, now });
    expect(entries.map((entry) => entry.text)).toEqual(["texto 1"]);
    const input = inputs[0];
    expect(input?.ScanIndexForward).toBe(false);
    expect(input?.ProjectionExpression).toMatch(/^(#p\d+)(, #p\d+)*$/);
    expect(Object.values(input?.ExpressionAttributeNames ?? {})).toEqual(
      expect.arrayContaining(["text", "raw", "locale"]),
    );
  });
});
