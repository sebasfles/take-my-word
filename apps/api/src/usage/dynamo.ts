import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { count, type Table } from "../lib/dynamo.ts";
import { quotaKey, userKey } from "../lib/table.ts";
import type { UsageStore } from "./store.ts";

export function dynamoUsageStore(table: Table): UsageStore {
  return {
    async usedSeconds(userId, day) {
      const { Item } = await table.client.send(
        new GetCommand({
          TableName: table.name,
          Key: { PK: userKey(userId), SK: quotaKey(day) },
          ProjectionExpression: "#seconds",
          ExpressionAttributeNames: { "#seconds": "seconds" },
        }),
      );
      return count(Item?.seconds);
    },
  };
}
