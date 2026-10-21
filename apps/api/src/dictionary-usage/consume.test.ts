import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { beforeEach, describe, expect, it } from "vitest";
import type { MatchableTerm } from "../dictionary/matching.ts";
import { createLogger } from "../lib/log.ts";
import { createUsageConsumer } from "./consume.ts";

function insert(
  sequence: string,
  image: Record<string, string>,
  eventName = "INSERT",
): DynamoDBRecord {
  return {
    eventName: eventName as DynamoDBRecord["eventName"],
    dynamodb: {
      SequenceNumber: sequence,
      NewImage: Object.fromEntries(
        Object.entries(image).map(([name, value]) => [name, { S: value }]),
      ),
    },
  };
}

const dictation = (sequence: string, text: string, createdAt = "2026-10-21T10:00:00.000Z") =>
  insert(sequence, { PK: "USER#u1", SK: `DICTATION#${createdAt}#r${sequence}`, text, createdAt });

class World {
  terms: MatchableTerm[] = [
    { key: "kubernetes", term: "Kubernetes", aliases: ["cubernetes"] },
    { key: "groq", term: "Groq", aliases: [] },
  ];
  uses: { userKey: string; termKey: string; usedAt: string }[] = [];
  failOn: string | undefined;
  stale = new Set<string>();
  lines: string[] = [];

  consume = createUsageConsumer({
    usage: {
      terms: () => Promise.resolve(this.terms),
      recordUse: (userKey, termKey, usedAt) => {
        if (termKey === this.failOn) return Promise.reject(new Error("throttled"));
        if (this.stale.has(termKey)) return Promise.resolve(false);
        this.uses.push({ userKey, termKey, usedAt });
        return Promise.resolve(true);
      },
    },
    log: createLogger({}, (line) => this.lines.push(line)),
  });

  run(...records: DynamoDBRecord[]) {
    const event: DynamoDBStreamEvent = { Records: records };
    return this.consume(event);
  }
}

let world: World;
beforeEach(() => {
  world = new World();
});

describe("dictionary-usage", () => {
  it("counts each matched term once at the dictation's time and logs the dictation", async () => {
    const result = await world.run(dictation("1", "Subí cubernetes y Kubernetes a producción"));
    expect(result.batchItemFailures).toEqual([]);
    expect(world.uses).toEqual([
      { userKey: "USER#u1", termKey: "kubernetes", usedAt: "2026-10-21T10:00:00.000Z" },
    ]);
    expect(world.lines.map((line) => JSON.parse(line) as unknown)).toContainEqual(
      expect.objectContaining({
        message: "usage recorded",
        userId: "u1",
        dictation: "DICTATION#2026-10-21T10:00:00.000Z#r1",
        matched: 1,
        counted: 1,
      }),
    );
    expect(world.lines.join("\n")).not.toContain("producción");
  });

  it("ignores anything but inserted dictations", async () => {
    await world.run(
      insert("1", { PK: "USER#u1", SK: "QUOTA#2026-10-21", text: "Groq", createdAt: "x" }),
      insert("2", { PK: "USER#u1", SK: "DICTATION#a#b", text: "Groq", createdAt: "x" }, "REMOVE"),
      insert("3", { PK: "USER#u1", SK: "DICTATION#a#b", text: "Groq", createdAt: "x" }, "MODIFY"),
    );
    expect(world.uses).toEqual([]);
  });

  it("treats a redelivered or stale use as a no-op", async () => {
    world.stale.add("groq");
    const result = await world.run(dictation("1", "Groq"));
    expect(result.batchItemFailures).toEqual([]);
    expect(world.uses).toEqual([]);
  });

  it("reports the first failing record and stops, so the retry starts there", async () => {
    world.failOn = "groq";
    const result = await world.run(
      dictation("1", "Kubernetes"),
      dictation("2", "Groq"),
      dictation("3", "Kubernetes"),
    );
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "2" }]);
    expect(world.uses).toHaveLength(1);
  });
});
