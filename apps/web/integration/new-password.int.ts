import { randomBytes } from "node:crypto";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminListDevicesCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { afterEach, describe, expect, it } from "vitest";
import { accountApi } from "../src/lib/api.ts";
import {
  apiUrl,
  choosePassword,
  cookiesOf,
  env,
  sessionOf,
  signIn,
  signOut,
  signOutLatest,
  userPoolId,
} from "./harness.ts";

const admin = new CognitoIdentityProviderClient({ region: "us-east-1" });
const table = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

function password(): string {
  return `Tmw-${randomBytes(12).toString("hex")}-Aa1`;
}

async function deviceKeys(username: string): Promise<string[]> {
  const { Devices } = await admin.send(
    new AdminListDevicesCommand({ UserPoolId: userPoolId, Username: username }),
  );
  return (Devices ?? []).flatMap((device) => (device.DeviceKey ? [device.DeviceKey] : []));
}

describe("first sign-in with a temporary password against the dev pool", () => {
  afterEach(signOutLatest);

  it("asks for a new password, then signs in with a confirmed device that reaches the API", async () => {
    const username = `web-e2e-${randomBytes(4).toString("hex")}`;
    const temporary = password();
    const created = await admin.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        TemporaryPassword: temporary,
        MessageAction: "SUPPRESS",
      }),
    );
    const sub = created.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
    try {
      const started = await signIn(username, temporary);
      expect(started.status).toBe(200);
      expect(await started.json()).toEqual({ step: "new-password" });
      expect(started.headers.getSetCookie()).toHaveLength(1);

      const chosen = await choosePassword(cookiesOf(started), password());
      expect(chosen.status).toBe(200);
      const session = sessionOf(cookiesOf(chosen));
      expect(await deviceKeys(username)).toEqual([session.deviceKey]);

      const settings = await accountApi(apiUrl, session.accessToken).settings();
      expect(settings.kind).toBe("ok");

      expect((await signOut(cookiesOf(chosen))).status).toBe(200);
      expect(await deviceKeys(username)).toEqual([]);
    } finally {
      await signOutLatest();
      await admin.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
      if (sub !== undefined) {
        await table.send(
          new DeleteCommand({
            TableName: env("TABLE_NAME"),
            Key: { PK: `USER#${sub}`, SK: "SETTINGS" },
          }),
        );
      }
    }
  });
});
