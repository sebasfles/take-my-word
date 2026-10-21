import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { unlessConditionFails, type Table } from "../lib/dynamo.ts";
import { settingsKey, userKey } from "../lib/table.ts";
import { settingsFrom } from "./defaults.ts";
import type { SettingsStore } from "./store.ts";

export function dynamoSettingsStore(table: Table): SettingsStore {
  const key = (userId: string) => ({ PK: userKey(userId), SK: settingsKey });
  const get = async (userId: string) => {
    const { Item } = await table.client.send(
      new GetCommand({ TableName: table.name, Key: key(userId), ConsistentRead: true }),
    );
    return Item && settingsFrom(Item);
  };
  return {
    get,
    async create(userId, settings) {
      const created = await unlessConditionFails(async () => {
        await table.client.send(
          new PutCommand({
            TableName: table.name,
            Item: { ...key(userId), ...settings },
            ConditionExpression: "attribute_not_exists(SK)",
          }),
        );
        return true;
      }, false);
      return created ? settings : ((await get(userId)) ?? settings);
    },
    async put(userId, settings) {
      await table.client.send(
        new PutCommand({ TableName: table.name, Item: { ...key(userId), ...settings } }),
      );
    },
    resetDefaultStyle: (userId, styleId, to) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new UpdateCommand({
            TableName: table.name,
            Key: key(userId),
            UpdateExpression: "SET defaultStyleId = :to",
            ConditionExpression: "defaultStyleId = :styleId",
            ExpressionAttributeValues: { ":to": to, ":styleId": styleId },
          }),
        );
      }, undefined),
  };
}
