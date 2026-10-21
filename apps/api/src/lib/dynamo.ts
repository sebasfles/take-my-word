import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { QueryCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export interface Table {
  client: DynamoDBDocumentClient;
  name: string;
}

export type Item = Record<string, unknown>;

export function projectionOf(attributes: readonly string[]) {
  return {
    ProjectionExpression: attributes.map((_, index) => `#p${String(index)}`).join(", "),
    ExpressionAttributeNames: Object.fromEntries(
      attributes.map((name, index) => [`#p${String(index)}`, name]),
    ),
  };
}

export async function queryPrefix(
  table: Table,
  pk: string,
  prefix: string,
  projection?: readonly string[],
): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Item | undefined;
  do {
    const page = await table.client.send(
      new QueryCommand({
        TableName: table.name,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
        ...(projection && projectionOf(projection)),
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function countPrefix(table: Table, pk: string, prefix: string): Promise<number> {
  let count = 0;
  let startKey: Item | undefined;
  do {
    const page = await table.client.send(
      new QueryCommand({
        TableName: table.name,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
        Select: "COUNT",
        ExclusiveStartKey: startKey,
      }),
    );
    count += page.Count ?? 0;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return count;
}

export async function unlessConditionFails<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return fallback;
    throw error;
  }
}

export const text = (value: unknown): string => (typeof value === "string" ? value : "");
export const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
export const count = (value: unknown): number => (typeof value === "number" ? value : 0);
