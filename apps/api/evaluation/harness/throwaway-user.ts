import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { signIn } from "@take-my-word/cognito";

export interface ThrowawayUser {
  username: string;
  sub: string;
  accessToken: string;
  remove: () => Promise<void>;
}

export interface Pool {
  region: string;
  userPoolId: string;
  clientId: string;
  tableName: string;
}

async function removeItems(
  table: DynamoDBDocumentClient,
  tableName: string,
  sub: string,
  username: string,
) {
  let start: Record<string, unknown> | undefined;
  do {
    const page = await table.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${sub}` },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: start,
      }),
    );
    const keys = (page.Items ?? []).map((item) => ({ PK: String(item.PK), SK: String(item.SK) }));
    for (let index = 0; index < keys.length; index += 25) {
      let pending: Record<string, { DeleteRequest: { Key: Record<string, string> } }[]> = {
        [tableName]: keys.slice(index, index + 25).map((Key) => ({ DeleteRequest: { Key } })),
      };
      for (let attempt = 0; (pending[tableName]?.length ?? 0) > 0; attempt += 1) {
        if (attempt > 5) throw new Error(`items of ${username} left after batch deletes`);
        if (attempt > 0) await sleep(100 * 2 ** attempt);
        const { UnprocessedItems } = await table.send(
          new BatchWriteCommand({ RequestItems: pending }),
        );
        pending = (UnprocessedItems ?? {}) as typeof pending;
      }
    }
    start = page.LastEvaluatedKey;
  } while (start !== undefined);
}

export async function createThrowawayUser(pool: Pool, prefix: string): Promise<ThrowawayUser> {
  const admin = new CognitoIdentityProviderClient({ region: pool.region });
  const table = DynamoDBDocumentClient.from(new DynamoDBClient({ region: pool.region }));
  const username = `${prefix}-${randomBytes(4).toString("hex")}`;
  const password = `Tmw-${randomBytes(12).toString("hex")}-Aa1`;
  const created = await admin.send(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: username,
      TemporaryPassword: password,
      MessageAction: "SUPPRESS",
    }),
  );
  const sub = created.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
  const remove = async () => {
    await admin.send(
      new AdminDeleteUserCommand({ UserPoolId: pool.userPoolId, Username: username }),
    );
    if (sub !== undefined) await removeItems(table, pool.tableName, sub, username);
  };
  try {
    if (sub === undefined) throw new Error(`${username} has no sub`);
    await admin.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: pool.userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      }),
    );
    const signedIn = await signIn({
      userPoolId: pool.userPoolId,
      clientId: pool.clientId,
      username,
      password,
    });
    if (signedIn.kind !== "signed-in") throw new Error(`${username} could not sign in`);
    return { username, sub, accessToken: signedIn.session.accessToken, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}
