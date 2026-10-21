import type { DynamoDBBatchResponse, DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { termsIn } from "../dictionary/matching.ts";
import type { Logger } from "../lib/log.ts";
import { dictationPrefix } from "../lib/table.ts";
import type { MatchableTerm } from "../dictionary/matching.ts";
import type { UsageStore } from "./usage-store.ts";

export interface UsageDeps {
  usage: UsageStore;
  log: Logger;
}

interface SavedDictation {
  userKey: string;
  sk: string;
  text: string;
  createdAt: string;
}

function savedDictation(record: DynamoDBRecord): SavedDictation | undefined {
  const image = record.dynamodb?.NewImage;
  const userKey = image?.PK?.S;
  const sk = image?.SK?.S;
  const text = image?.text?.S;
  const createdAt = image?.createdAt?.S;
  if (record.eventName !== "INSERT" || !userKey || !sk?.startsWith(dictationPrefix)) return;
  if (text === undefined || createdAt === undefined) return;
  return { userKey, sk, text, createdAt };
}

export function createUsageConsumer({ usage, log }: UsageDeps) {
  return async (event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
    const dictionaries = new Map<string, Promise<MatchableTerm[]>>();
    for (const record of event.Records) {
      const dictation = savedDictation(record);
      if (!dictation) continue;
      try {
        let terms = dictionaries.get(dictation.userKey);
        if (!terms) {
          terms = usage.terms(dictation.userKey);
          dictionaries.set(dictation.userKey, terms);
        }
        const matched = termsIn(dictation.text, await terms);
        let counted = 0;
        for (const term of matched) {
          if (await usage.recordUse(dictation.userKey, term.key, dictation.createdAt)) counted += 1;
        }
        log.info("usage recorded", {
          userId: dictation.userKey.slice("USER#".length),
          dictation: dictation.sk,
          matched: matched.length,
          counted,
        });
      } catch (error) {
        log.error("usage failed", {
          dictation: dictation.sk,
          reason: error instanceof Error ? error.name : "unknown",
        });
        return {
          batchItemFailures: [{ itemIdentifier: record.dynamodb?.SequenceNumber ?? "" }],
        };
      }
    }
    return { batchItemFailures: [] };
  };
}
