import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { handle } from "@hono/aws-lambda";
import { z } from "zod";
import { dynamoAppRuleStore } from "../app-rules/dynamo.ts";
import { dynamoDictionaryStore } from "../dictionary/dynamo.ts";
import { dynamoHistoryStore } from "../history/dynamo.ts";
import { createLogger } from "../lib/log.ts";
import { dynamoSettingsStore } from "../settings/dynamo.ts";
import { dynamoStyleStore } from "../styles/dynamo.ts";
import { createApi } from "./app.ts";

const env = z.object({ TABLE_NAME: z.string().min(1) }).parse(process.env);
const table = {
  client: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  name: env.TABLE_NAME,
};

export const handler = handle(
  createApi({
    dictionary: dynamoDictionaryStore(table),
    styles: dynamoStyleStore(table),
    appRules: dynamoAppRuleStore(table),
    settings: dynamoSettingsStore(table),
    history: dynamoHistoryStore(table),
    newId: randomUUID,
    now: () => new Date(),
    log: createLogger({ function: "api" }),
  }),
);
