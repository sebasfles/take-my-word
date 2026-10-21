import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { queryPrefix, text, texts, unlessConditionFails, type Table } from "../lib/dynamo.ts";
import { termKey, termPrefix } from "../lib/table.ts";
import type { UsageStore } from "./usage-store.ts";

export function dynamoUsageStore(table: Table): UsageStore {
  return {
    async terms(userKey) {
      const items = await queryPrefix(table, userKey, termPrefix, ["SK", "term", "aliases"]);
      return items.map((item) => ({
        key: text(item.SK).slice(termPrefix.length),
        term: text(item.term),
        aliases: texts(item.aliases),
      }));
    },
    recordUse: (userKey, key, usedAt) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new UpdateCommand({
            TableName: table.name,
            Key: { PK: userKey, SK: termKey(key) },
            UpdateExpression: "ADD useCount :one SET lastUsedAt = :usedAt",
            ConditionExpression: "attribute_exists(SK) AND lastUsedAt < :usedAt",
            ExpressionAttributeValues: { ":one": 1, ":usedAt": usedAt },
          }),
        );
        return true;
      }, false),
  };
}
