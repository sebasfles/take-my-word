import { z } from "zod";
import { seal, unseal } from "./seal.ts";

export const sessionCookieName = "__Host-tmw-session";
export const refreshCookieName = "__Host-tmw-refresh";
export const challengeCookieName = "__Host-tmw-challenge";

export const rememberedMaxAgeSeconds = 400 * 24 * 60 * 60;
export const challengeMaxAgeSeconds = 3 * 60;
const refreshAheadMs = 60_000;

export interface WebSession {
  accessToken: string;
  refreshToken: string;
  deviceKey: string;
  remember: boolean;
}

export interface Challenge {
  username: string;
  challengeSession: string;
  remember: boolean;
}

export interface CookieOptions {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
}

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface CookieJar {
  get(name: string): string | undefined;
}

const baseOptions: CookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };

const sessionPayloadSchema = z.object({
  accessToken: z.string().min(1),
  deviceKey: z.string().min(1),
  remember: z.boolean(),
});

const challengeSchema = z.object({
  username: z.string().min(1),
  challengeSession: z.string().min(1),
  remember: z.boolean(),
});

const claimsSchema = z.object({ username: z.string().min(1), exp: z.number() });

export type AccessClaims = z.infer<typeof claimsSchema>;

export function accessClaims(accessToken: string): AccessClaims | null {
  const payload = accessToken.split(".")[1];
  if (payload === undefined) return null;
  try {
    const parsed = claimsSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function sessionCookies(session: WebSession, key: Buffer): CookieToSet[] {
  const options: CookieOptions = session.remember
    ? { ...baseOptions, maxAge: rememberedMaxAgeSeconds }
    : baseOptions;
  const payload = JSON.stringify({
    accessToken: session.accessToken,
    deviceKey: session.deviceKey,
    remember: session.remember,
  });
  return [
    { name: sessionCookieName, value: seal(payload, key, sessionCookieName), options },
    {
      name: refreshCookieName,
      value: seal(session.refreshToken, key, refreshCookieName),
      options,
    },
  ];
}

export function readSession(jar: CookieJar, key: Buffer): WebSession | null {
  const payload = unseal(jar.get(sessionCookieName), key, sessionCookieName);
  const refreshToken = unseal(jar.get(refreshCookieName), key, refreshCookieName);
  if (payload === null || refreshToken === null || refreshToken === "") return null;
  try {
    const parsed = sessionPayloadSchema.safeParse(JSON.parse(payload));
    if (!parsed.success || accessClaims(parsed.data.accessToken) === null) return null;
    return { ...parsed.data, refreshToken };
  } catch {
    return null;
  }
}

export function needsRefresh(session: WebSession, now: number): boolean {
  const claims = accessClaims(session.accessToken);
  return claims === null || claims.exp * 1000 - now < refreshAheadMs;
}

export function clearedSessionCookies(): CookieToSet[] {
  return [sessionCookieName, refreshCookieName, challengeCookieName].map((name) => ({
    name,
    value: "",
    options: { ...baseOptions, maxAge: 0 },
  }));
}

export function challengeCookie(challenge: Challenge, key: Buffer): CookieToSet {
  return {
    name: challengeCookieName,
    value: seal(JSON.stringify(challenge), key, challengeCookieName),
    options: { ...baseOptions, maxAge: challengeMaxAgeSeconds },
  };
}

export function readChallenge(jar: CookieJar, key: Buffer): Challenge | null {
  const payload = unseal(jar.get(challengeCookieName), key, challengeCookieName);
  if (payload === null) return null;
  try {
    const parsed = challengeSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
