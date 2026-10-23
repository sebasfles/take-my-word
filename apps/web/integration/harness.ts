import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  newPasswordHandler,
  refreshHandler,
  signInHandler,
  signOutHandler,
  type HandlerDeps,
} from "../src/lib/handlers.ts";
import { cognitoPort } from "../src/lib/server/config.ts";
import { accessClaims, readSession, type WebSession } from "../src/lib/session.ts";
import { testKey } from "../src/testing/tokens.ts";

process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

export const origin = env("WEB_URL");
export const userPoolId = env("USER_POOL_ID");
export const apiUrl = env("API_URL");

export const clock = { now: Date.now() };
export const logged: string[] = [];

const deps: HandlerDeps = {
  cognito: cognitoPort({ userPoolId, clientId: env("USER_POOL_CLIENT_ID") }),
  key: testKey(),
  now: () => clock.now,
  log: (message, error) => {
    logged.push(`${message}: ${error instanceof Error ? error.name : "unknown"}`);
  },
  webOrigin: origin,
};
const handlerDeps = () => Promise.resolve(deps);

let latest: string | null = null;

export function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
}

function track(response: Response): Response {
  const cookies = cookiesOf(response);
  if (response.ok && readSessionOrNull(cookies) !== null) latest = cookies;
  return response;
}

function readSessionOrNull(cookie: string): WebSession | null {
  const values = new Map(
    cookie
      .split("; ")
      .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
  );
  return readSession({ get: (name) => values.get(name) }, deps.key);
}

export function sessionOf(cookie: string): WebSession {
  const session = readSessionOrNull(cookie);
  if (session === null) throw new Error("no session in the cookies");
  return session;
}

function post(path: string, init: { cookie?: string; body?: unknown }): NextRequest {
  return new NextRequest(new URL(path, origin), {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

export async function signIn(username: string, password: string): Promise<Response> {
  clock.now = Date.now();
  logged.length = 0;
  return track(
    await signInHandler(handlerDeps)(
      post("/api/session", { body: { username, password, remember: true } }),
    ),
  );
}

export async function choosePassword(cookie: string, newPassword: string): Promise<Response> {
  return track(
    await newPasswordHandler(handlerDeps)(
      post("/api/session/password", { cookie, body: { newPassword } }),
    ),
  );
}

export async function refresh(cookie: string): Promise<Response> {
  return track(await refreshHandler(handlerDeps)(post("/api/session/refresh", { cookie })));
}

export async function refreshPastExpiry(cookie: string): Promise<Response> {
  const exp = accessClaims(sessionOf(cookie).accessToken)?.exp ?? 0;
  clock.now = exp * 1000 + 1_000;
  return refresh(cookie);
}

export async function signOut(cookie: string): Promise<Response> {
  clock.now = Date.now();
  const response = await signOutHandler(handlerDeps)(post("/api/session/sign-out", { cookie }));
  if (cookie === latest) latest = null;
  return response;
}

export async function signOutLatest(): Promise<void> {
  if (latest !== null) await signOut(latest);
}
