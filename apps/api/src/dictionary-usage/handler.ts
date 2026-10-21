import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { createLogger } from "../lib/log.ts";
import { createUsageConsumer } from "./consume.ts";
import { dynamoUsageStore } from "./dynamo.ts";

const env = z.object({ TABLE_NAME: z.string().min(1) }).parse(process.env);

export const handler = createUsageConsumer({
  usage: dynamoUsageStore({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    name: env.TABLE_NAME,
  }),
  log: createLogger({ function: "dictionary-usage" }),
});
