import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  completeNewPassword,
  confirmDevice,
  forgetDevice,
  refresh,
  revokeToken,
  signIn,
} from "@take-my-word/cognito";
import { z } from "zod";
import type { AuthDeps, CognitoPort } from "../auth.ts";
import { parseCookieKey } from "../seal.ts";

export interface WebConfig {
  apiUrl: string;
  userPoolId: string;
  clientId: string;
  webOrigin: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function webConfig(): WebConfig {
  return {
    apiUrl: required("API_URL"),
    userPoolId: required("USER_POOL_ID"),
    clientId: required("USER_POOL_CLIENT_ID"),
    webOrigin: required("WEB_ORIGIN"),
  };
}

const webSecretSchema = z.object({ COOKIE_KEY: z.string().min(1) });

async function loadCookieKey(): Promise<Buffer> {
  const local = process.env.WEB_COOKIE_KEY;
  if (local) return parseCookieKey(local);
  const secretId = required("WEB_SECRET_ID");
  const secret = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  const parsed = webSecretSchema.parse(JSON.parse(secret.SecretString ?? "{}"));
  return parseCookieKey(parsed.COOKIE_KEY);
}

let cookieKey: Promise<Buffer> | undefined;

export function getCookieKey(): Promise<Buffer> {
  cookieKey ??= loadCookieKey().catch((error: unknown) => {
    cookieKey = undefined;
    throw error;
  });
  return cookieKey;
}

export function cognitoPort(config: Pick<WebConfig, "userPoolId" | "clientId">): CognitoPort {
  const { userPoolId, clientId } = config;
  return {
    signIn: async (username, password) => signIn({ userPoolId, clientId, username, password }),
    completeNewPassword: async (challenge, newPassword) =>
      completeNewPassword({
        userPoolId,
        clientId,
        username: challenge.username,
        challengeSession: challenge.challengeSession,
        newPassword,
      }),
    confirmDevice: async (session) => confirmDevice({ userPoolId, session, deviceName: "web" }),
    refresh: async (refreshToken, deviceKey) =>
      refresh({ userPoolId, clientId, refreshToken, deviceKey }),
    forgetDevice: async (accessToken, deviceKey) =>
      forgetDevice({ userPoolId, accessToken, deviceKey }),
    revokeToken: async (refreshToken) => revokeToken({ userPoolId, clientId, refreshToken }),
  };
}

export function logError(message: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "unknown";
  console.error(JSON.stringify({ level: "error", message, error: name }));
}

export async function liveAuthDeps(): Promise<AuthDeps> {
  return {
    cognito: cognitoPort(webConfig()),
    key: await getCookieKey(),
    now: () => Date.now(),
    log: logError,
  };
}
