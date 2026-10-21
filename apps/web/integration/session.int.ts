import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { fetchSettings } from "../src/lib/api.ts";
import {
  refreshHandler,
  signInHandler,
  signOutHandler,
  type HandlerDeps,
} from "../src/lib/handlers.ts";
import { cognitoPort } from "../src/lib/server/config.ts";
import { accessClaims, readSession } from "../src/lib/session.ts";
import { testKey } from "../src/testing/tokens.ts";

process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

const origin = "https://dev.takemyword.fless.dev";
const apiUrl = env("API_URL");
const clock = { now: Date.now() };
const logged: string[] = [];
const deps: HandlerDeps = {
  cognito: cognitoPort({ userPoolId: env("USER_POOL_ID"), clientId: env("USER_POOL_CLIENT_ID") }),
  key: testKey(),
  now: () => clock.now,
  log: (message, error) => {
    logged.push(`${message}: ${error instanceof Error ? error.name : "unknown"}`);
  },
  webOrigin: origin,
};
const handlerDeps = () => Promise.resolve(deps);

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
}

function sessionOf(cookie: string) {
  const values = new Map(
    cookie
      .split("; ")
      .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
  );
  const session = readSession({ get: (name) => values.get(name) }, deps.key);
  if (session === null) throw new Error("no session in the cookies");
  return session;
}

async function refreshPastExpiry(cookie: string): Promise<Response> {
  const exp = accessClaims(sessionOf(cookie).accessToken)?.exp ?? 0;
  clock.now = exp * 1000 + 1_000;
  return refreshHandler(handlerDeps)(
    new NextRequest(new URL("/api/session/refresh", origin), {
      method: "POST",
      headers: { origin, cookie },
    }),
  );
}

async function signOut(cookie: string): Promise<void> {
  const response = await signOutHandler(handlerDeps)(
    new NextRequest(new URL("/api/session/sign-out", origin), {
      method: "POST",
      headers: { origin, cookie },
    }),
  );
  expect(response.status).toBe(200);
}

async function signIn(): Promise<string> {
  clock.now = Date.now();
  logged.length = 0;
  const response = await signInHandler(handlerDeps)(
    new NextRequest(new URL("/api/session", origin), {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: env("CREW_E2E_USERNAME"),
        password: env("CREW_E2E_PASSWORD"),
        remember: true,
      }),
    }),
  );
  expect(response.status).toBe(200);
  for (const header of response.headers.getSetCookie()) {
    console.info(`${header.slice(0, header.indexOf("="))}: ${Buffer.byteLength(header)} bytes`);
    expect(Buffer.byteLength(header)).toBeLessThan(4096);
  }
  return cookiesOf(response);
}

describe("web session against the dev pool", () => {
  it("refreshes an expired session through the request path with the device key", async () => {
    const signedIn = await signIn();
    try {
      const before = sessionOf(signedIn);
      const response = await refreshPastExpiry(signedIn);
      expect(response.status).toBe(200);
      for (const header of response.headers.getSetCookie()) {
        expect(Buffer.byteLength(header)).toBeLessThan(4096);
      }
      const after = sessionOf(cookiesOf(response));
      expect(after.refreshToken).not.toBe(before.refreshToken);
      expect(after.accessToken).not.toBe(before.accessToken);
      expect(after.deviceKey).toBe(before.deviceKey);

      const settings = await fetchSettings(apiUrl, after.accessToken);
      expect(settings.kind).toBe("ok");
      await signOut(cookiesOf(response));
    } catch (error) {
      await signOut(signedIn).catch(() => undefined);
      throw error;
    }
  });

  it("lets a second tab renewing after the first reuse its cookies without a second rotation", async () => {
    const signedIn = await signIn();
    const firstTab = await refreshPastExpiry(signedIn);
    expect(firstTab.status).toBe(200);
    const renewed = cookiesOf(firstTab);
    clock.now = Date.now();
    const secondTab = await refreshHandler(handlerDeps)(
      new NextRequest(new URL("/api/session/refresh", origin), {
        method: "POST",
        headers: { origin, cookie: renewed },
      }),
    );
    expect(secondTab.status).toBe(200);
    expect(secondTab.headers.getSetCookie()).toEqual([]);
    const settings = await fetchSettings(apiUrl, sessionOf(renewed).accessToken);
    expect(settings.kind).toBe("ok");
    const later = await refreshPastExpiry(renewed);
    expect(later.status).toBe(200);
    await signOut(cookiesOf(later));
  });

  it("signs the session out for good: its refresh token no longer renews", async () => {
    const signedIn = await signIn();
    await signOut(signedIn);
    const response = await refreshPastExpiry(signedIn);
    expect(response.status).toBe(401);
    expect(logged).toEqual(["refresh rejected: NotAuthorizedException"]);
  });
});
