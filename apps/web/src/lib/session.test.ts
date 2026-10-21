import { describe, expect, it } from "vitest";
import { fakeAccessToken, testKey } from "../testing/tokens.ts";
import {
  accessClaims,
  challengeCookie,
  challengeCookieName,
  clearedSessionCookies,
  needsRefresh,
  readChallenge,
  readSession,
  refreshCookieName,
  rememberedMaxAgeSeconds,
  sessionCookieName,
  sessionCookies,
  type CookieToSet,
  type WebSession,
} from "./session.ts";

const now = Date.UTC(2026, 9, 21, 12);
const key = testKey();

function session(overrides: Partial<WebSession> = {}): WebSession {
  return {
    accessToken: fakeAccessToken({ username: "crew-e2e", exp: now / 1000 + 3600 }),
    refreshToken: "refresh-1",
    deviceKey: "us-east-1_device",
    remember: false,
    ...overrides,
  };
}

function jarOf(cookies: CookieToSet[]) {
  const values = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  return { get: (name: string) => values.get(name) };
}

describe("session cookies", () => {
  it("are HttpOnly, Secure, SameSite=Lax host cookies holding nothing in the clear", () => {
    const value = session();
    const cookies = sessionCookies(value, key);
    expect(cookies.map((cookie) => cookie.name)).toEqual([sessionCookieName, refreshCookieName]);
    for (const cookie of cookies) {
      expect(cookie.name.startsWith("__Host-")).toBe(true);
      expect(cookie.options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });
      expect(cookie.value).not.toContain(value.refreshToken);
      expect(cookie.value).not.toContain(value.accessToken.split(".")[1]);
    }
  });

  it("last for the browser session unless remember me was checked", () => {
    for (const cookie of sessionCookies(session({ remember: false }), key)) {
      expect(cookie.options.maxAge).toBeUndefined();
    }
    for (const cookie of sessionCookies(session({ remember: true }), key)) {
      expect(cookie.options.maxAge).toBe(rememberedMaxAgeSeconds);
    }
  });

  it("read back the session they were written from", () => {
    const value = session({ remember: true });
    expect(readSession(jarOf(sessionCookies(value, key)), key)).toEqual(value);
  });

  it("read as signed out when either cookie is missing, tampered or swapped", () => {
    const [access, refresh] = sessionCookies(session(), key);
    if (access === undefined || refresh === undefined) throw new Error("two cookies expected");
    const flip = (value: string) =>
      `${value.slice(0, -2)}${value.at(-2) === "A" ? "B" : "A"}${value.slice(-1)}`;
    expect(readSession(jarOf([access]), key)).toBeNull();
    expect(readSession(jarOf([refresh]), key)).toBeNull();
    expect(readSession(jarOf([{ ...access, value: flip(access.value) }, refresh]), key)).toBeNull();
    expect(
      readSession(jarOf([access, { ...refresh, value: flip(refresh.value) }]), key),
    ).toBeNull();
    expect(
      readSession(
        jarOf([
          { ...access, value: refresh.value },
          { ...refresh, value: access.value },
        ]),
        key,
      ),
    ).toBeNull();
    expect(readSession(jarOf([access, refresh]), testKey())).toBeNull();
  });

  it("read as signed out when the access token carries no username or expiry", () => {
    const cookies = sessionCookies(session({ accessToken: "not-a-jwt" }), key);
    expect(readSession(jarOf(cookies), key)).toBeNull();
  });

  it("are cleared together with the challenge cookie", () => {
    const cleared = clearedSessionCookies();
    expect(cleared.map((cookie) => cookie.name).sort()).toEqual(
      [challengeCookieName, refreshCookieName, sessionCookieName].sort(),
    );
    for (const cookie of cleared) {
      expect(cookie.value).toBe("");
      expect(cookie.options.maxAge).toBe(0);
    }
  });
});

describe("needsRefresh", () => {
  const exp = now / 1000 + 3600;
  const value = session({ accessToken: fakeAccessToken({ username: "u", exp }) });

  it("keeps a token that has more than a minute left", () => {
    expect(needsRefresh(value, exp * 1000 - 61_000)).toBe(false);
  });

  it("refreshes a token within its last minute or past its expiry", () => {
    expect(needsRefresh(value, exp * 1000 - 59_000)).toBe(true);
    expect(needsRefresh(value, exp * 1000 + 1)).toBe(true);
  });
});

describe("accessClaims", () => {
  it("reads the username and expiry of an access token", () => {
    expect(accessClaims(fakeAccessToken({ username: "ana", exp: 42 }))).toEqual({
      username: "ana",
      exp: 42,
    });
  });
});

describe("challenge cookie", () => {
  it("holds the challenge for three minutes and reads it back", () => {
    const challenge = { username: "ana", challengeSession: "cognito-session", remember: true };
    const cookie = challengeCookie(challenge, key);
    expect(cookie.options.maxAge).toBe(180);
    expect(cookie.value).not.toContain("cognito-session");
    expect(readChallenge(jarOf([cookie]), key)).toEqual(challenge);
  });
});
