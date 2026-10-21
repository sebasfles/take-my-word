import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  count,
  projectionOf,
  text,
  unlessConditionFails,
  type Item,
  type Table,
} from "../lib/dynamo.ts";
import { dictationPrefix, userKey } from "../lib/table.ts";
import type { DictationEntry, HistoryStore } from "./store.ts";

const projection = ["SK", "createdAt", "locale", "text", "raw", "styleId", "audioSeconds"];

function entry(item: Item): DictationEntry {
  const styleId = text(item.styleId);
  return {
    sk: text(item.SK),
    createdAt: text(item.createdAt),
    locale: text(item.locale),
    text: text(item.text),
    raw: text(item.raw),
    ...(styleId !== "" && { styleId }),
    audioSeconds: count(item.audioSeconds),
  };
}

export function dynamoHistoryStore(table: Table): HistoryStore {
  return {
    async page(userId, { limit, after, now }) {
      const pk = userKey(userId);
      const { ProjectionExpression, ExpressionAttributeNames } = projectionOf(projection);
      const entries: DictationEntry[] = [];
      let start = after;
      while (entries.length < limit) {
        const { Items, LastEvaluatedKey } = await table.client.send(
          new QueryCommand({
            TableName: table.name,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            FilterExpression: "#expiresAt > :now",
            ExpressionAttributeNames: { ...ExpressionAttributeNames, "#expiresAt": "expiresAt" },
            ExpressionAttributeValues: {
              ":pk": pk,
              ":prefix": dictationPrefix,
              ":now": Math.floor(now.getTime() / 1000),
            },
            ProjectionExpression,
            ScanIndexForward: false,
            Limit: limit - entries.length,
            ...(start !== undefined && { ExclusiveStartKey: { PK: pk, SK: start } }),
          }),
        );
        entries.push(...(Items ?? []).map(entry));
        if (LastEvaluatedKey === undefined) return { entries };
        start = text(LastEvaluatedKey.SK);
      }
      const last = entries.at(-1)?.sk;
      return { entries, ...(last !== undefined && { last }) };
    },
    remove: (userId, sk) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new DeleteCommand({
            TableName: table.name,
            Key: { PK: userKey(userId), SK: sk },
            ConditionExpression: "attribute_exists(SK)",
          }),
        );
        return true;
      }, false),
  };
}
