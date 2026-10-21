import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand, UpdateCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { DictationRecord, DictationStore } from "./dictation-store.ts";
import type { QuotaCharge, QuotaStore } from "./quota.ts";
import { dictationKey, dictationRetentionSeconds, quotaKey, userKey } from "./table.ts";

export function dynamoQuotaStore(client: DynamoDBDocumentClient, tableName: string): QuotaStore {
  return {
    async charge({ userId, day, seconds, capSeconds, expiresAt }: QuotaCharge) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: userKey(userId), SK: quotaKey(day) },
            UpdateExpression: "ADD #seconds :seconds SET #expiresAt = :expiresAt",
            ConditionExpression: "attribute_not_exists(#seconds) OR #seconds < :cap",
            ExpressionAttributeNames: { "#seconds": "seconds", "#expiresAt": "expiresAt" },
            ExpressionAttributeValues: {
              ":seconds": seconds,
              ":cap": capSeconds,
              ":expiresAt": expiresAt,
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
