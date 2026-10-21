import { DeleteCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  count,
  countPrefix,
  queryPrefix,
  text,
  texts,
  unlessConditionFails,
  type Item,
  type Table,
} from "../lib/dynamo.ts";
import { termKey, termPrefix, userKey } from "../lib/table.ts";
import type { DictionaryStore, TermRecord } from "./store.ts";

export function termRecord(item: Item): TermRecord {
  return {
    key: text(item.SK).slice(termPrefix.length),
    term: text(item.term),
    aliases: texts(item.aliases),
    useCount: count(item.useCount),
    lastUsedAt: text(item.lastUsedAt),
    createdAt: text(item.createdAt),
  };
}

export function dynamoDictionaryStore(table: Table): DictionaryStore {
  return {
    async list(userId) {
      return (await queryPrefix(table, userKey(userId), termPrefix)).map(termRecord);
    },
    count: (userId) => countPrefix(table, userKey(userId), termPrefix),
    add: (userId, { key, ...record }) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new PutCommand({
            TableName: table.name,
            Item: { PK: userKey(userId), SK: termKey(key), ...record },
            ConditionExpression: "attribute_not_exists(SK)",
          }),
        );
        return true;
      }, false),
    updateAliases: (userId, key, aliases) =>
      unlessConditionFails(async () => {
        const { Attributes } = await table.client.send(
          new UpdateCommand({
            TableName: table.name,
            Key: { PK: userKey(userId), SK: termKey(key) },
            UpdateExpression: "SET aliases = :aliases",
            ConditionExpression: "attribute_exists(SK)",
            ExpressionAttributeValues: { ":aliases": aliases },
            ReturnValues: "ALL_NEW",
          }),
        );
        return Attributes && termRecord(Attributes);
      }, undefined),
    remove: (userId, key) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new DeleteCommand({
            TableName: table.name,
            Key: { PK: userKey(userId), SK: termKey(key) },
            ConditionExpression: "attribute_exists(SK)",
          }),
        );
        return true;
      }, false),
  };
}
