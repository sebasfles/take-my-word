import { pasteKeystrokes, type PasteKeystroke } from "@take-my-word/shared";
import { DeleteCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  countPrefix,
  queryPrefix,
  text,
  unlessConditionFails,
  type Item,
  type Table,
} from "../lib/dynamo.ts";
import { appRuleKey, appRulePrefix, userKey } from "../lib/table.ts";
import type { AppRuleRecord, AppRuleStore } from "./store.ts";

function keystrokeOf(value: unknown): PasteKeystroke {
  return pasteKeystrokes.find((keystroke) => keystroke === value) ?? "ctrl+v";
}

export function appRule(item: Item): AppRuleRecord {
  const styleId = text(item.styleId);
  return {
    appId: text(item.SK).slice(appRulePrefix.length),
    ...(styleId !== "" && { styleId }),
    keystroke: keystrokeOf(item.keystroke),
  };
}

export function dynamoAppRuleStore(table: Table): AppRuleStore {
  const key = (userId: string, appId: string) => ({ PK: userKey(userId), SK: appRuleKey(appId) });
  return {
    async list(userId) {
      return (await queryPrefix(table, userKey(userId), appRulePrefix)).map(appRule);
    },
    count: (userId) => countPrefix(table, userKey(userId), appRulePrefix),
    create: (userId, { appId, ...rule }) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new PutCommand({
            TableName: table.name,
            Item: { ...key(userId, appId), ...rule },
            ConditionExpression: "attribute_not_exists(SK)",
          }),
        );
        return true;
      }, false),
    update: (userId, appId, { styleId, keystroke }) =>
      unlessConditionFails(async () => {
        const { Attributes } = await table.client.send(
          new UpdateCommand({
            TableName: table.name,
            Key: key(userId, appId),
            UpdateExpression:
              styleId === undefined
                ? "SET keystroke = :keystroke REMOVE styleId"
                : "SET keystroke = :keystroke, styleId = :styleId",
            ConditionExpression: "attribute_exists(SK)",
            ExpressionAttributeValues: {
              ":keystroke": keystroke,
              ...(styleId !== undefined && { ":styleId": styleId }),
            },
            ReturnValues: "ALL_NEW",
          }),
        );
        return Attributes && appRule(Attributes);
      }, undefined),
    remove: (userId, appId) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new DeleteCommand({
            TableName: table.name,
            Key: key(userId, appId),
            ConditionExpression: "attribute_exists(SK)",
          }),
        );
        return true;
      }, false),
    detachStyle: (userId, appId, styleId) =>
      unlessConditionFails(async () => {
        await table.client.send(
          new UpdateCommand({
            TableName: table.name,
            Key: key(userId, appId),
            UpdateExpression: "REMOVE styleId",
            ConditionExpression: "styleId = :styleId",
            ExpressionAttributeValues: { ":styleId": styleId },
          }),
        );
      }, undefined),
  };
}
