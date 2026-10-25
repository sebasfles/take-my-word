import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  PutCommand,
  type BatchGetCommandOutput,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { appRule } from "../app-rules/dynamo.ts";
import { termRecord } from "../dictionary/dynamo.ts";
import { queryPrefix, text, type Item, type Table } from "../lib/dynamo.ts";
import {
  appRuleKey,
  dictationKey,
  dictationRetentionSeconds,
  quotaKey,
  settingsKey,
  stylePrefix,
  termPrefix,
  userKey,
} from "../lib/table.ts";
import { settingsFrom } from "../settings/defaults.ts";
import type { DictationRecord, DictationStore } from "./dictation-store.ts";
import type { ProfileStore } from "./profile.ts";
import type { QuotaCharge, QuotaStore } from "./quota.ts";

export function dynamoQuotaStore(client: DynamoDBDocumentClient, tableName: string): QuotaStore {
  return {
    async charge({ userId, day, seconds, capSeconds, expiresAt }: QuotaCharge) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: userKey(userId), SK: quotaKey(day) },
            UpdateExpression: "ADD #seconds :seconds SET #expiresAt = :expiresAt",
            ...(capSeconds !== undefined && {
              ConditionExpression: "attribute_not_exists(#seconds) OR #seconds < :cap",
            }),
            ExpressionAttributeNames: { "#seconds": "seconds", "#expiresAt": "expiresAt" },
            ExpressionAttributeValues: {
              ":seconds": seconds,
              ":expiresAt": expiresAt,
              ...(capSeconds !== undefined && { ":cap": capSeconds }),
            },
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;
        throw error;
      }
    },
  };
}

export function dynamoDictationStore(
  client: DynamoDBDocumentClient,
  tableName: string,
): DictationStore {
  return {
    async save(record: DictationRecord) {
      const createdAt = record.createdAt.toISOString();
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: userKey(record.userId),
            SK: dictationKey(createdAt, record.requestId),
            createdAt,
            locale: record.locale,
            audioSeconds: record.audioSeconds,
            raw: record.raw,
            text: record.text,
            styleId: record.styleId,
            providers: record.providers,
            latencyMs: record.latencyMs,
            tokens: record.tokens,
            expiresAt: Math.floor(record.createdAt.getTime() / 1000) + dictationRetentionSeconds,
          },
          ConditionExpression: "attribute_not_exists(SK)",
        }),
      );
    },
  };
}

const batchGetAttempts = 3;

async function batchGet(table: Table, keys: Item[]): Promise<Item[]> {
  const found: Item[] = [];
  let pending: Item[] | undefined = keys;
  for (let attempt = 0; pending && pending.length > 0 && attempt < batchGetAttempts; attempt += 1) {
    const result: BatchGetCommandOutput = await table.client.send(
      new BatchGetCommand({ RequestItems: { [table.name]: { Keys: pending } } }),
    );
    found.push(...(result.Responses?.[table.name] ?? []));
    pending = result.UnprocessedKeys?.[table.name]?.Keys;
  }
  if (pending && pending.length > 0) throw new Error("BatchGetItem left keys unprocessed");
  return found;
}

export function dynamoProfileStore(table: Table): ProfileStore {
  return {
    async load(userId, appId) {
      const pk = userKey(userId);
      const keys: Item[] = [{ PK: pk, SK: settingsKey }];
      if (appId !== undefined) keys.push({ PK: pk, SK: appRuleKey(appId) });
      const [singles, styles, terms] = await Promise.all([
        batchGet(table, keys),
        queryPrefix(table, pk, stylePrefix, ["SK", "prompt"]),
        queryPrefix(table, pk, termPrefix, ["SK", "term", "aliases", "useCount", "lastUsedAt"]),
      ]);
      const settings = singles.find((item) => item.SK === settingsKey);
      const rule = singles.find((item) => item.SK !== settingsKey);
      return {
        ...(settings && { settings: settingsFrom(settings) }),
        ...(rule && { rule: appRule(rule) }),
        styles: styles.map((item) => ({
          id: text(item.SK).slice(stylePrefix.length),
          prompt: text(item.prompt),
        })),
        terms: terms.map(termRecord),
      };
    },
  };
}
