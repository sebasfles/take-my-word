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
    async page(userId, { limit, after }) {
      const pk = userKey(userId);
      const { Items, LastEvaluatedKey } = await table.client.send(
        new QueryCommand({
          TableName: table.name,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: { ":pk": pk, ":prefix": dictationPrefix },
          ...projectionOf(projection),
          ScanIndexForward: false,
          Limit: limit,
          ...(after !== undefined && { ExclusiveStartKey: { PK: pk, SK: after } }),
        }),
      );
      const last = LastEvaluatedKey === undefined ? undefined : text(LastEvaluatedKey.SK);
      return { entries: (Items ?? []).map(entry), ...(last && { last }) };
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
