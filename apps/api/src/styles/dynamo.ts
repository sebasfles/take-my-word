import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  countPrefix,
  queryPrefix,
  text,
  unlessConditionFails,
  type Item,
  type Table,
} from "../lib/dynamo.ts";
import { styleKey, stylePrefix, userKey } from "../lib/table.ts";
import type { StyleRecord, StyleStore } from "./store.ts";

export function styleRecord(item: Item): StyleRecord {
  return {
    id: text(item.SK).slice(stylePrefix.length),
    name: text(item.name),
    prompt: text(item.prompt),
    createdAt: text(item.createdAt),
  };
}

export function dynamoStyleStore(table: Table): StyleStore {
  return {
    async list(userId) {
      return (await queryPrefix(table, userKey(userId), stylePrefix)).map(styleRecord);
    },
    async get(userId, id) {
      const { Item } = await table.client.send(
        new GetCommand({ TableName: table.name, Key: { PK: userKey(userId), SK: styleKey(id) } }),
      );
      return Item && styleRecord(Item);
    },
    count: (userId) => countPrefix(table, userKey(userId), stylePrefix),
    async create(userId, { id, ...record }) {
      await table.client.send(
        new PutCommand({
          TableName: table.name,
          Item: { PK: userKey(userId), SK: styleKey(id), ...record },
          ConditionExpression: "attribute_not_exists(SK)",
        }),
      );
    },
    update: (userId, id, { name, prompt }) =>
      unlessConditionFails(async () => {
        const { Attributes } = await table.client.send(
          new UpdateCommand({
            TableName: table.name,
            Key: { PK: userKey(userId), SK: styleKey(id) },
            UpdateExpression: "SET #name = :name, #prompt = :prompt",
            ConditionExpression: "attribute_exists(SK)",
            ExpressionAttributeNames: { "#name": "name", "#prompt": "prompt" },
            ExpressionAttributeValues: { ":name": name, ":prompt": prompt },
            ReturnValues: "ALL_NEW",
          }),
        );
        return Attributes && styleRecord(Attributes);
      }, undefined),
    remove: (userId, id) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new DeleteCommand({
            TableName: table.name,
            Key: { PK: userKey(userId), SK: styleKey(id) },
            ConditionExpression: "attribute_exists(SK)",
          }),
        );
        return true;
      }, false),
  };
}
